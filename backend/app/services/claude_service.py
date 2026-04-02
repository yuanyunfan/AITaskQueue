"""
Thin wrapper around claude_agent_sdk.query() that runs a single Claude Code
session for a given task.  Yields normalised AgentEvent objects that the
orchestrator can feed into the DB / WS broadcast layer.

The SDK spawns Claude Code CLI as a child process.  It inherits the shell env,
so ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY (pointing at LiteLLM) work
transparently — no extra config needed.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator, Any

from claude_agent_sdk import query, ClaudeAgentOptions

from app.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Event types emitted by the runner
# ---------------------------------------------------------------------------

class AgentEventType(str, Enum):
    PROGRESS = "progress"      # tool call completed → progress bump
    TOOL_USE = "tool_use"      # a tool is being invoked
    TEXT = "text"              # assistant text chunk
    RESULT = "result"          # final result (task done)
    ERROR = "error"            # unrecoverable error


@dataclass
class AgentEvent:
    type: AgentEventType
    message: str
    progress_pct: int = 0          # 0-100 estimated progress
    result_text: str | None = None # only set for RESULT events
    tool_name: str | None = None   # only set for TOOL_USE events
    session_id: str | None = None
    cost_usd: float = 0.0
    raw: Any = field(default=None, repr=False)


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

class ClaudeAgentRunner:
    """Manages one Claude Code session for a single task."""

    def __init__(
        self,
        task_id: str,
        prompt: str,
        working_dir: str | None = None,
        max_turns: int | None = None,
    ):
        self.task_id = task_id
        self.prompt = prompt
        self.working_dir = working_dir or settings.effective_working_dir
        self.max_turns = max_turns or settings.claude_max_turns
        self._cancelled = False
        self._session_id: str | None = None

    async def run(self) -> AsyncIterator[AgentEvent]:
        """
        Execute the agent and yield events as they arrive.

        The SDK's query() returns an AsyncIterator — we consume it directly
        with `async for`.
        """
        opts = ClaudeAgentOptions(
            max_turns=self.max_turns,
            permission_mode=settings.claude_permission_mode,
            cwd=self.working_dir,
        )
        if settings.claude_model:
            opts.model = settings.claude_model

        tool_calls_seen = 0
        max_expected = self.max_turns  # rough denominator for progress

        try:
            logger.info(
                "Agent runner starting for task %s (max_turns=%d, cwd=%s)",
                self.task_id, self.max_turns, self.working_dir,
            )

            # query() returns AsyncIterator — iterate with async for
            async for message in query(prompt=self.prompt, options=opts):
                if self._cancelled:
                    logger.info("Agent runner cancelled mid-stream for task %s", self.task_id)
                    break

                msg_type = getattr(message, "type", None)

                if msg_type == "assistant":
                    # AssistantMessage — may contain text and/or tool_use blocks
                    content = getattr(message, "message", None)
                    if content and hasattr(content, "content"):
                        for block in content.content:
                            if hasattr(block, "text"):
                                yield AgentEvent(
                                    type=AgentEventType.TEXT,
                                    message=block.text[:200],
                                    progress_pct=min(
                                        int(tool_calls_seen / max_expected * 90), 90
                                    ),
                                )
                            elif hasattr(block, "type") and block.type == "tool_use":
                                tool_calls_seen += 1
                                tool_name = getattr(block, "name", "unknown")
                                pct = min(
                                    int(tool_calls_seen / max_expected * 90), 90
                                )
                                yield AgentEvent(
                                    type=AgentEventType.TOOL_USE,
                                    message=f"调用工具: {tool_name}",
                                    progress_pct=pct,
                                    tool_name=tool_name,
                                )
                                logger.debug(
                                    "Task %s: tool_use %s (progress %d%%)",
                                    self.task_id, tool_name, pct,
                                )

                elif msg_type == "result":
                    # ResultMessage — execution complete
                    result_text = getattr(message, "result", "") or ""
                    self._session_id = getattr(message, "session_id", None)
                    cost = getattr(message, "total_cost_usd", 0.0) or 0.0
                    yield AgentEvent(
                        type=AgentEventType.RESULT,
                        message="任务执行完成",
                        progress_pct=100,
                        result_text=result_text,
                        session_id=self._session_id,
                        cost_usd=cost,
                    )
                    logger.info(
                        "Task %s completed (session=%s, cost=$%.4f)",
                        self.task_id, self._session_id, cost,
                    )

        except Exception as exc:
            logger.error("Agent runner error for task %s: %s", self.task_id, exc)
            yield AgentEvent(
                type=AgentEventType.ERROR,
                message=f"Agent 执行出错: {str(exc)[:300]}",
                progress_pct=0,
            )

    def cancel(self):
        """Signal the runner to stop at the next message boundary."""
        self._cancelled = True
        logger.info("Agent runner cancelled for task %s", self.task_id)
