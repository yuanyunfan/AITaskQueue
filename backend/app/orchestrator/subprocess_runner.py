"""
Claude CLI subprocess runner — replaces claude_agent_sdk.

Spawns `claude -p --output-format stream-json --verbose` as an async subprocess,
reads JSONL output line-by-line, and yields normalised AgentEvent objects.

For single-turn chat, uses `--output-format json` (non-streaming).

The CLI binary inherits the shell env (ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY),
so no extra credential wiring is needed.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator, Any

from app.config import settings

logger = logging.getLogger(__name__)

# Sentinel to signal end of event queue
_STREAM_END = object()


# ---------------------------------------------------------------------------
# Event types (same contract as the old claude_service.py)
# ---------------------------------------------------------------------------

class AgentEventType(str, Enum):
    PROGRESS = "progress"
    TOOL_USE = "tool_use"
    TEXT = "text"
    RESULT = "result"
    ERROR = "error"


@dataclass
class AgentEvent:
    type: AgentEventType
    message: str
    progress_pct: int = 0
    result_text: str | None = None
    tool_name: str | None = None
    session_id: str | None = None
    cost_usd: float = 0.0
    raw: Any = field(default=None, repr=False)


# ---------------------------------------------------------------------------
# Internal per-process state
# ---------------------------------------------------------------------------

@dataclass
class _ProcessState:
    """Tracks a single CLI subprocess."""
    process: asyncio.subprocess.Process
    task_id: str
    started_at: float          # time.monotonic()
    tool_calls_seen: int = 0
    last_event_at: float = 0.0
    pid: int = 0
    reader_task: asyncio.Task | None = None
    event_queue: asyncio.Queue | None = None


# ---------------------------------------------------------------------------
# Main runner class
# ---------------------------------------------------------------------------

class ClaudeCodeRunner:
    """
    Manages Claude CLI subprocess lifecycle for task execution.

    Each task gets one subprocess. The runner tracks all active processes
    and provides methods to spawn, monitor, kill, and collect results.
    """

    def __init__(self):
        self._processes: dict[str, _ProcessState] = {}  # task_id -> state

    # ------------------------------------------------------------------
    # Streaming spawn (for task execution)
    # ------------------------------------------------------------------

    async def spawn_streaming(
        self,
        task_id: str,
        prompt: str,
        *,
        working_dir: str | None = None,
        max_turns: int | None = None,
        system_prompt: str | None = None,
        permission_mode: str | None = None,
        model: str | None = None,
        max_budget_usd: float | None = None,
    ) -> AsyncIterator[AgentEvent]:
        """
        Spawn claude CLI in stream-json mode and yield AgentEvents.

        This is an async generator -- the caller iterates with `async for`.
        The subprocess is tracked internally and cleaned up on completion.

        Uses a background reader task + asyncio.Queue to decouple stdout
        reading from event consumption, ensuring clean teardown on break/cancel.
        """
        if task_id in self._processes:
            logger.warning("Task %s already has a running process", task_id)
            yield AgentEvent(
                type=AgentEventType.ERROR,
                message="Task already has a running process",
            )
            return

        cmd = self._build_command(
            prompt,
            mode="stream-json",
            working_dir=working_dir,
            max_turns=max_turns,
            system_prompt=system_prompt,
            permission_mode=permission_mode,
            model=model,
            max_budget_usd=max_budget_usd,
        )

        logger.info(
            "Spawning CLI for task %s: %s",
            task_id, " ".join(cmd[:6]) + "...",
        )

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=working_dir or settings.effective_working_dir,
                limit=1024 * 1024,  # 1MB line limit (CLI init msg can be >64KB)
            )
        except FileNotFoundError:
            yield AgentEvent(
                type=AgentEventType.ERROR,
                message=f"Claude CLI not found: {settings.claude_cli_path}",
            )
            return
        except OSError as exc:
            yield AgentEvent(
                type=AgentEventType.ERROR,
                message=f"Failed to start CLI process: {exc}",
            )
            return

        now = time.monotonic()
        max_expected = max_turns or settings.claude_max_turns
        event_queue: asyncio.Queue[AgentEvent | object] = asyncio.Queue()

        state = _ProcessState(
            process=proc,
            task_id=task_id,
            started_at=now,
            last_event_at=now,
            pid=proc.pid or 0,
            event_queue=event_queue,
        )
        self._processes[task_id] = state

        logger.info("CLI process started for task %s (PID %d)", task_id, state.pid)

        # Launch background reader task that feeds events into the queue
        reader = asyncio.create_task(
            self._reader_loop(state, max_expected, event_queue)
        )
        state.reader_task = reader

        try:
            # Yield events from queue until stream ends
            while True:
                item = await event_queue.get()
                if item is _STREAM_END:
                    break
                yield item  # type: ignore[misc]
        except asyncio.CancelledError:
            logger.info("Stream consumption cancelled for task %s", task_id)
            raise
        finally:
            # Cleanup: terminate process and cancel reader
            await self._cleanup_process(task_id, proc, reader)

    async def _reader_loop(
        self,
        state: _ProcessState,
        max_expected: int,
        queue: asyncio.Queue,
    ) -> None:
        """
        Background task: read stdout line-by-line and parse JSONL into AgentEvents.
        Puts events into the queue; puts _STREAM_END when done.
        """
        try:
            assert state.process.stdout is not None
            async for raw_line in state.process.stdout:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue

                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    logger.debug("Non-JSON line from CLI: %s", line[:200])
                    continue

                state.last_event_at = time.monotonic()
                msg_type = data.get("type")

                if msg_type == "system" and data.get("subtype") == "init":
                    session_id = data.get("session_id", "")
                    model = data.get("model", "")
                    logger.info(
                        "Task %s: CLI session init (session=%s, model=%s)",
                        state.task_id, session_id, model,
                    )
                    continue

                elif msg_type == "assistant":
                    message_obj = data.get("message", {})
                    content_blocks = message_obj.get("content", [])

                    for block in content_blocks:
                        block_type = block.get("type")

                        if block_type == "tool_use":
                            state.tool_calls_seen += 1
                            tool_name = block.get("name", "unknown")
                            pct = min(
                                int(state.tool_calls_seen / max_expected * 90), 95,
                            )
                            await queue.put(AgentEvent(
                                type=AgentEventType.TOOL_USE,
                                message=f"Calling tool: {tool_name}",
                                progress_pct=pct,
                                tool_name=tool_name,
                                raw=block,
                            ))

                        elif block_type == "text":
                            text = block.get("text", "")
                            if state.tool_calls_seen:
                                pct = min(
                                    int(state.tool_calls_seen / max_expected * 90),
                                    95,
                                )
                            else:
                                pct = self._time_progress(state)
                            await queue.put(AgentEvent(
                                type=AgentEventType.TEXT,
                                message=text[:200],
                                progress_pct=pct,
                                raw=block,
                            ))

                elif msg_type == "result":
                    subtype = data.get("subtype", "")
                    result_text = data.get("result", "")
                    cost = data.get("total_cost_usd", 0.0) or 0.0
                    session_id = data.get("session_id")
                    is_error = data.get("is_error", False)

                    if is_error or subtype == "error":
                        await queue.put(AgentEvent(
                            type=AgentEventType.ERROR,
                            message=f"CLI returned error: {result_text[:300]}",
                            cost_usd=cost,
                            session_id=session_id,
                            raw=data,
                        ))
                    else:
                        await queue.put(AgentEvent(
                            type=AgentEventType.RESULT,
                            message="Task completed",
                            progress_pct=100,
                            result_text=result_text,
                            cost_usd=cost,
                            session_id=session_id,
                            raw=data,
                        ))
        except asyncio.CancelledError:
            logger.debug("Reader task cancelled for task %s", state.task_id)
        except Exception:
            logger.exception("Reader error for task %s", state.task_id)
            await queue.put(AgentEvent(
                type=AgentEventType.ERROR,
                message="Stream reader internal error",
            ))
        finally:
            await queue.put(_STREAM_END)

    async def _cleanup_process(
        self,
        task_id: str,
        proc: asyncio.subprocess.Process,
        reader: asyncio.Task,
    ) -> None:
        """Terminate process and cancel reader task. Safe to call multiple times."""
        self._processes.pop(task_id, None)

        # Terminate the process if still running
        if proc.returncode is None:
            logger.info("Terminating CLI process for task %s (PID %d)", task_id, proc.pid)
            try:
                proc.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(proc.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                try:
                    proc.kill()
                    await proc.wait()
                except ProcessLookupError:
                    pass

        # Cancel the reader task
        if not reader.done():
            reader.cancel()
            try:
                await reader
            except asyncio.CancelledError:
                pass

        # Capture stderr for diagnostics
        if proc.returncode is not None and proc.returncode != 0:
            stderr_data = b""
            if proc.stderr:
                try:
                    stderr_data = await asyncio.wait_for(
                        proc.stderr.read(), timeout=2.0
                    )
                except asyncio.TimeoutError:
                    pass
            stderr_text = stderr_data.decode("utf-8", errors="replace")[:500]
            logger.warning(
                "CLI process for task %s exited with code %d: %s",
                task_id, proc.returncode, stderr_text,
            )

    def _time_progress(self, state: _ProcessState) -> int:
        """Fallback progress estimation based on elapsed time."""
        elapsed = time.monotonic() - state.started_at
        timeout = settings.task_timeout_seconds
        return min(int(elapsed / timeout * 80), 80)

    # ------------------------------------------------------------------
    # Non-streaming spawn (for chat)
    # ------------------------------------------------------------------

    async def run_once(
        self,
        prompt: str,
        *,
        system_prompt: str | None = None,
        working_dir: str | None = None,
        model: str | None = None,
        timeout_seconds: int = 60,
    ) -> tuple[str, float]:
        """
        Run claude CLI in json mode (non-streaming).  Returns (result_text, cost_usd).

        Used for single-turn chat responses where streaming is unnecessary.
        Uses --max-turns 1 to limit to a single conversational turn (no tools).
        """
        cmd = self._build_command(
            prompt,
            mode="json",
            system_prompt=system_prompt,
            working_dir=working_dir,
            model=model,
            max_turns=1,  # single turn for chat, effectively disables tool loops
        )

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=working_dir or settings.effective_working_dir,
            )
            stdout_data, stderr_data = await asyncio.wait_for(
                proc.communicate(), timeout=timeout_seconds,
            )
        except FileNotFoundError:
            raise RuntimeError(
                f"Claude CLI not found: {settings.claude_cli_path}"
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise RuntimeError(
                f"Claude CLI timed out after {timeout_seconds}s"
            )

        if proc.returncode != 0:
            stderr_text = stderr_data.decode("utf-8", errors="replace")[:500]
            raise RuntimeError(
                f"Claude CLI exited with code {proc.returncode}: {stderr_text}"
            )

        # Parse JSON result
        stdout_text = stdout_data.decode("utf-8", errors="replace").strip()
        data = self._parse_json_output(stdout_text)

        result_text = data.get("result", "")
        cost = data.get("total_cost_usd", 0.0) or 0.0

        if data.get("is_error"):
            raise RuntimeError(f"Claude error: {result_text[:300]}")

        return result_text, cost

    @staticmethod
    def _parse_json_output(stdout_text: str) -> dict:
        """Parse JSON output from CLI, handling potential non-JSON preamble."""
        try:
            return json.loads(stdout_text)
        except json.JSONDecodeError:
            pass

        # Sometimes CLI outputs non-JSON lines before the result;
        # try to find the last valid JSON object.
        for line in reversed(stdout_text.split("\n")):
            line = line.strip()
            if line.startswith("{"):
                try:
                    return json.loads(line)
                except json.JSONDecodeError:
                    continue

        raise RuntimeError(
            f"CLI returned non-JSON output: {stdout_text[:300]}"
        )

    # ------------------------------------------------------------------
    # Command builder
    # ------------------------------------------------------------------

    def _build_command(
        self,
        prompt: str,
        *,
        mode: str = "stream-json",  # "json" or "stream-json"
        working_dir: str | None = None,
        max_turns: int | None = None,
        system_prompt: str | None = None,
        permission_mode: str | None = None,
        model: str | None = None,
        max_budget_usd: float | None = None,
        allowed_tools: list[str] | None = None,
    ) -> list[str]:
        """Build the CLI command as a list of arguments."""
        cli_path = settings.claude_cli_path
        cmd: list[str] = [cli_path, "-p"]  # --print (non-interactive)

        # Output format
        cmd.extend(["--output-format", mode])
        if mode == "stream-json":
            cmd.append("--verbose")

        # Permission mode
        perm = permission_mode or settings.claude_permission_mode
        if perm:
            cmd.extend(["--permission-mode", perm])

        # Model override
        mdl = model or settings.claude_model
        if mdl:
            cmd.extend(["--model", mdl])

        # Max turns
        if max_turns:
            cmd.extend(["--max-turns", str(max_turns)])

        # Budget cap
        budget = max_budget_usd or settings.claude_max_budget_usd
        if budget and budget > 0:
            cmd.extend(["--max-budget-usd", str(budget)])

        # System prompt
        if system_prompt:
            cmd.extend(["--system-prompt", system_prompt])

        # Allowed tools restriction (only pass when list is non-empty)
        if allowed_tools is not None and len(allowed_tools) > 0:
            cmd.extend(["--allowedTools"] + allowed_tools)

        # Use '--' to prevent prompt content from being parsed as flags
        cmd.append("--")
        cmd.append(prompt)

        return cmd

    # ------------------------------------------------------------------
    # Process control
    # ------------------------------------------------------------------

    def get_pid(self, task_id: str) -> int | None:
        """Return the PID of the subprocess for a task, or None."""
        state = self._processes.get(task_id)
        return state.pid if state else None

    def is_running(self, task_id: str) -> bool:
        """Check if a task's subprocess is still running."""
        state = self._processes.get(task_id)
        if not state:
            return False
        return state.process.returncode is None

    def is_timed_out(
        self, task_id: str, timeout_seconds: int | None = None,
    ) -> bool:
        """Check if a task's subprocess has exceeded the timeout."""
        state = self._processes.get(task_id)
        if not state:
            return False
        elapsed = time.monotonic() - state.started_at
        limit = timeout_seconds or settings.task_timeout_seconds
        return elapsed > limit

    def estimate_progress(self, task_id: str) -> int:
        """Estimate progress for a running task (0-95, never 100 before done)."""
        state = self._processes.get(task_id)
        if not state:
            return 0
        if state.tool_calls_seen > 0:
            max_expected = settings.claude_max_turns
            return min(int(state.tool_calls_seen / max_expected * 90), 95)
        return self._time_progress(state)

    async def kill_process(self, task_id: str) -> bool:
        """
        Kill a task's subprocess with SIGTERM -> wait 5s -> SIGKILL.
        Returns True if a process was found and killed.
        """
        state = self._processes.get(task_id)
        if not state:
            return False

        proc = state.process

        # Cancel the reader task first so it stops feeding the queue
        if state.reader_task and not state.reader_task.done():
            state.reader_task.cancel()
            try:
                await state.reader_task
            except asyncio.CancelledError:
                pass

        # Signal the event queue so spawn_streaming's consumer loop unblocks
        if state.event_queue:
            await state.event_queue.put(AgentEvent(
                type=AgentEventType.ERROR,
                message="Task was cancelled",
            ))
            await state.event_queue.put(_STREAM_END)

        if proc.returncode is not None:
            # Already exited — let _cleanup_process handle removal
            return True

        logger.info(
            "Killing CLI process for task %s (PID %d)", task_id, state.pid,
        )

        # SIGTERM first
        try:
            proc.terminate()
        except ProcessLookupError:
            return True

        # Wait up to 5 seconds for graceful exit
        try:
            await asyncio.wait_for(proc.wait(), timeout=5.0)
            logger.info("Process %d terminated gracefully", state.pid)
            return True
        except asyncio.TimeoutError:
            pass

        # SIGKILL
        logger.warning(
            "Process %d did not respond to SIGTERM, sending SIGKILL", state.pid,
        )
        try:
            proc.kill()
            await proc.wait()
        except ProcessLookupError:
            pass

        return True

    async def kill_all(self) -> int:
        """Kill all tracked subprocesses. Returns count of killed processes."""
        task_ids = list(self._processes.keys())
        count = 0
        for task_id in task_ids:
            if await self.kill_process(task_id):
                count += 1
        logger.info("Killed %d subprocess(es) during shutdown", count)
        return count

    @property
    def active_count(self) -> int:
        """Number of currently tracked subprocesses."""
        return len(self._processes)

    @property
    def active_task_ids(self) -> list[str]:
        """List of task IDs with active subprocesses."""
        return list(self._processes.keys())
