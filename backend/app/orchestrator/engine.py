"""
Orchestrator -- manages the dispatch-execute-complete lifecycle for all tasks.

Uses ClaudeCodeRunner (CLI subprocess via asyncio.create_subprocess_exec)
instead of claude_agent_sdk.

Two async background loops:
  1. Dispatch + Monitor  -- assigns queued tasks + checks timeouts (poll interval)
  2. Uptime              -- broadcasts main-agent heartbeat (1 s)
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from app.config import settings
from app.models.enums import TaskStatus, AgentStatus, EventType
from app.services.task_service import TaskService
from app.services.agent_service import AgentService
from app.orchestrator.subprocess_runner import (
    ClaudeCodeRunner,
    AgentEvent,
    AgentEventType,
)
from app.orchestrator.scheduler import PriorityScheduler
from app.schemas.task import TaskResponse
from app.schemas.agent import SubAgentResponse
from app.ws.manager import ConnectionManager

logger = logging.getLogger(__name__)


class Orchestrator:
    """Central orchestrator that manages task dispatch and agent lifecycle."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        ws_manager: ConnectionManager,
    ):
        self._session_factory = session_factory
        self._ws = ws_manager
        self._bg_tasks: list[asyncio.Task] = []          # background loop tasks
        self._agent_tasks: dict[str, asyncio.Task] = {}   # agent_id -> asyncio.Task
        self._runner = ClaudeCodeRunner()                  # single runner for all subprocesses
        self._scheduler = PriorityScheduler()
        self._started_at: datetime | None = None
        self._stopped = False
        self._tick_lock = asyncio.Lock()                  # prevent concurrent ticks

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self):
        """Launch background loops."""
        self._stopped = False
        self._started_at = datetime.now(timezone.utc)

        # Set main agent to active
        async with self._session_factory() as session:
            svc = AgentService(session)
            await svc.update_main_agent(
                status=AgentStatus.ACTIVE,
                started_at=self._started_at,
            )

        # Recovery: reset any stale RUNNING tasks left from previous crash
        async with self._session_factory() as session:
            task_svc = TaskService(session)
            stale_running = await task_svc.get_by_status("running")
            for task in stale_running:
                await task_svc.update_fields(
                    task.id,
                    status=TaskStatus.QUEUED,
                    progress=0,
                    assigned_agent=None,
                    subprocess_pid=None,
                    last_activity_at=None,
                )
                logger.info("Reset stale running task %s to queued", task.id)

        self._bg_tasks.append(asyncio.create_task(self._dispatch_loop()))
        self._bg_tasks.append(asyncio.create_task(self._uptime_loop()))

        logger.info(
            "Orchestrator started (poll=%.1fs, max_agents=%d, cli=%s)",
            settings.orchestrator_poll_interval,
            settings.max_concurrent_agents,
            settings.claude_cli_path,
        )

    async def stop(self):
        """Gracefully shut down all loops and running agents."""
        self._stopped = True
        logger.info("Orchestrator shutting down...")

        # Kill all CLI subprocesses
        killed = await self._runner.kill_all()
        logger.info("Killed %d CLI subprocess(es)", killed)

        # Cancel all agent async tasks
        for agent_id, task in self._agent_tasks.items():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        # Cancel background loops
        for task in self._bg_tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        # Set main agent to idle
        async with self._session_factory() as session:
            svc = AgentService(session)
            await svc.update_main_agent(status=AgentStatus.IDLE)

        self._bg_tasks.clear()
        self._agent_tasks.clear()
        logger.info("Orchestrator stopped.")

    # ------------------------------------------------------------------
    # Main dispatch loop
    # ------------------------------------------------------------------

    async def _dispatch_loop(self):
        """Periodically run _tick() to dispatch and monitor tasks."""
        while not self._stopped:
            try:
                await self._tick()
            except Exception:
                logger.exception("Error in dispatch tick")
            await asyncio.sleep(settings.orchestrator_poll_interval)

    async def _tick(self):
        """
        Single orchestration tick:
        1. Check running tasks for timeouts and stale/orphaned state
        2. Pick queued tasks via scheduler
        3. Dispatch them

        Protected by _tick_lock to prevent concurrent ticks from dispatching
        the same task to multiple agents (race condition).
        """
        async with self._tick_lock, self._session_factory() as session:
            task_svc = TaskService(session)
            agent_svc = AgentService(session)

            # -- Phase 1a: Timeout check --
            running_tasks = await task_svc.get_by_status("running")
            for task in running_tasks:
                if task.id and self._runner.is_timed_out(task.id):
                    logger.warning("Task %s timed out", task.id)
                    await self._runner.kill_process(task.id)
                    # The _run_agent coroutine will handle the failure

            # -- Phase 1b: Stale / orphaned task recovery --
            # Detect tasks marked RUNNING in DB but no longer tracked by runner
            # (e.g. subprocess crashed without emitting an event)
            active_ids = set(self._runner.active_task_ids)
            stale_tasks = await task_svc.get_stale_tasks(
                active_task_ids=active_ids,
            )
            for task in stale_tasks:
                logger.warning(
                    "Resetting stale task %s (%s) — orphaned=%s",
                    task.id,
                    task.title,
                    task.id not in active_ids,
                )
                # Kill subprocess if it's somehow still tracked
                if task.id in active_ids:
                    await self._runner.kill_process(task.id)
                reset = await task_svc.reset_stale_task(task.id)
                if reset:
                    # Free the agent if it was assigned
                    if task.assigned_agent:
                        await agent_svc.free_agent(task.assigned_agent)
                        # Remove from agent_tasks tracking
                        agent_task = self._agent_tasks.pop(task.assigned_agent, None)
                        if agent_task:
                            agent_task.cancel()
                    await self._ws.broadcast(
                        "task:updated",
                        TaskResponse.from_model(reset).model_dump(),
                    )
                    await self._ws.broadcast(
                        "activity:event",
                        {
                            "id": str(uuid.uuid4())[:8],
                            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
                            "type": "info",
                            "message": f'⚠️ "{task.title}" 长时间无响应，已自动重置',
                        },
                    )

            # -- Phase 2: Scheduler picks next tasks --
            queued = await task_svc.get_by_status("queued")
            if not queued:
                return

            # How many slots are available?
            active_agents = len(self._agent_tasks)
            available_slots = settings.max_concurrent_agents - active_agents
            if available_slots <= 0:
                return

            selected = self._scheduler.pick_next_tasks(
                queued,
                max_dispatch=min(available_slots, 2),  # up to 2 per tick
                exclude_task_ids=set(self._runner.active_task_ids),
            )

            # -- Phase 3: Dispatch each selected task --
            for task in selected:
                if self._stopped:
                    break

                agent = await agent_svc.get_or_create_idle_agent(
                    max_agents=settings.max_concurrent_agents,
                )
                if not agent:
                    logger.debug("No idle agents available")
                    break

                await self._dispatch(task, agent, session, task_svc, agent_svc)

    # ------------------------------------------------------------------
    # Task dispatch
    # ------------------------------------------------------------------

    async def _dispatch(
        self,
        task,
        agent,
        session: AsyncSession,
        task_svc: TaskService,
        agent_svc: AgentService,
    ):
        """Assign a task to an agent and spawn the CLI subprocess."""
        now = datetime.now(timezone.utc)

        # Update task state
        task.status = TaskStatus.RUNNING
        task.assigned_agent = agent.id
        task.started_at = now
        task.last_activity_at = now

        # Update agent state
        agent.status = AgentStatus.ACTIVE
        agent.current_task_id = task.id
        agent.current_task_title = task.title
        agent.progress = 0
        agent.running_since = now

        await session.commit()
        await session.refresh(task)
        await session.refresh(agent)

        # Log decision
        decision = await agent_svc.add_decision(
            f'\u5c06 "{task.title}" \u5206\u914d\u7ed9 {agent.id} '
            f'(\u961f\u5217: {task.queue_type.value}, \u4f18\u5148\u7ea7: {task.priority.value})'
        )
        await agent_svc.increment_dispatched()
        await agent_svc.update_main_agent(
            current_decision=f'\u6b63\u5728\u8c03\u5ea6: "{task.title}" \u2192 {agent.id}',
        )

        # Broadcast updates
        await self._ws.broadcast(
            "task:updated",
            TaskResponse.from_model(task).model_dump(),
        )
        await self._ws.broadcast(
            "agent:sub_updated",
            SubAgentResponse.from_model(agent).model_dump(),
        )
        await self._ws.broadcast(
            "activity:event",
            {
                "id": str(uuid.uuid4())[:8],
                "timestamp": int(now.timestamp() * 1000),
                "type": "dispatch",
                "message": f'\u4e3b Agent \u5c06 "{task.title}" \u5206\u914d\u7ed9 {agent.id}',
            },
        )
        await self._ws.broadcast(
            "agent:decision",
            {
                "id": decision.id,
                "timestamp": int(decision.timestamp.timestamp() * 1000)
                if decision.timestamp else int(now.timestamp() * 1000),
                "message": decision.message,
            },
        )

        # Build prompt and launch CLI subprocess consumer
        prompt = self._build_task_prompt(task.title, task.description)
        async_task = asyncio.create_task(
            self._run_agent(
                task_id=task.id,
                task_title=task.title,
                agent_id=agent.id,
                queue_type=task.queue_type.value,
                prompt=prompt,
            )
        )
        self._agent_tasks[agent.id] = async_task

        logger.info(
            "Dispatched task '%s' (%s) to agent %s",
            task.title, task.id, agent.id,
        )

    # ------------------------------------------------------------------
    # Agent runner (consumes CLI subprocess events)
    # ------------------------------------------------------------------

    async def _run_agent(
        self,
        task_id: str,
        task_title: str,
        agent_id: str,
        queue_type: str,
        prompt: str,
    ):
        """
        Consume events from ClaudeCodeRunner.spawn_streaming() and update DB + WS.
        Runs as a standalone asyncio.Task.
        """
        last_progress = 0
        pid_stored = False

        try:
            async for event in self._runner.spawn_streaming(
                task_id=task_id,
                prompt=prompt,
                working_dir=settings.effective_working_dir,
                max_turns=settings.claude_max_turns,
                permission_mode=settings.claude_permission_mode,
                model=settings.claude_model or None,
                max_budget_usd=settings.claude_max_budget_usd or None,
            ):
                if self._stopped:
                    break

                # Store PID on first event
                if not pid_stored:
                    pid = self._runner.get_pid(task_id)
                    if pid:
                        await self._store_pid(task_id, agent_id, pid)
                        pid_stored = True

                # Persist + broadcast every event as an agent log
                await self._emit_agent_log(task_id, agent_id, event)

                if event.type in (
                    AgentEventType.PROGRESS,
                    AgentEventType.TOOL_USE,
                    AgentEventType.TEXT,
                ):
                    if event.progress_pct > last_progress:
                        last_progress = event.progress_pct
                        await self._update_progress(
                            task_id, agent_id, event.progress_pct, event.message,
                        )

                elif event.type == AgentEventType.RESULT:
                    await self._complete_task(
                        task_id, task_title, agent_id, queue_type,
                        event.result_text, event.cost_usd,
                    )

                elif event.type == AgentEventType.ERROR:
                    await self._fail_task(
                        task_id, task_title, agent_id, event.message,
                    )

        except asyncio.CancelledError:
            logger.info("Runner for agent %s cancelled", agent_id)
        except Exception:
            logger.exception("Unexpected error in runner for agent %s", agent_id)
            await self._fail_task(
                task_id, task_title, agent_id, "Runner internal error",
            )
        finally:
            self._agent_tasks.pop(agent_id, None)

    # ------------------------------------------------------------------
    # Prompt builder
    # ------------------------------------------------------------------

    def _build_task_prompt(self, title: str, description: str | None) -> str:
        """Build the prompt for the Claude CLI subprocess."""
        parts = [f"# \u4efb\u52a1: {title}"]
        if description:
            parts.append(f"\n{description}")
        parts.append(
            "\n\u8bf7\u5b8c\u6210\u4e0a\u8ff0\u4efb\u52a1\u3002\u5b8c\u6210\u540e\u7528\u4e2d\u6587\u7b80\u8981\u603b\u7ed3\u4f60\u505a\u4e86\u4ec0\u4e48\u3002"
        )
        return "\n".join(parts)

    # ------------------------------------------------------------------
    # DB + WS update helpers
    # ------------------------------------------------------------------

    async def _store_pid(self, task_id: str, agent_id: str, pid: int):
        """Store subprocess PID on task and agent records."""
        async with self._session_factory() as session:
            task_svc = TaskService(session)
            agent_svc = AgentService(session)
            await task_svc.update_fields(task_id, subprocess_pid=pid)
            await agent_svc.update_sub_agent(agent_id, pid=pid)

    async def _emit_agent_log(
        self, task_id: str, agent_id: str, event: AgentEvent,
    ):
        """Persist an AgentEvent to DB and broadcast via WS."""
        now = datetime.now(timezone.utc)
        ts_ms = int(now.timestamp() * 1000)

        async with self._session_factory() as session:
            agent_svc = AgentService(session)
            log = await agent_svc.add_log(
                agent_id=agent_id,
                task_id=task_id,
                event_type=event.type.value,
                message=event.message[:500],
                tool_name=event.tool_name,
                progress_pct=event.progress_pct,
                cost_usd=event.cost_usd if event.cost_usd else None,
            )

        await self._ws.broadcast(
            "agent:log",
            {
                "id": log.id,
                "agentId": agent_id,
                "taskId": task_id,
                "eventType": event.type.value,
                "message": event.message[:500],
                "toolName": event.tool_name,
                "progressPct": event.progress_pct,
                "costUsd": event.cost_usd if event.cost_usd else None,
                "timestamp": ts_ms,
            },
        )

    async def _update_progress(
        self, task_id: str, agent_id: str, progress: int, message: str,
    ):
        """Push a progress update to DB and WS."""
        now = datetime.now(timezone.utc)
        async with self._session_factory() as session:
            task_svc = TaskService(session)
            agent_svc = AgentService(session)

            task = await task_svc.update_fields(
                task_id, progress=progress, last_activity_at=now,
            )
            await agent_svc.update_sub_agent(agent_id, progress=progress)

            if task:
                await self._ws.broadcast(
                    "task:updated",
                    TaskResponse.from_model(task).model_dump(),
                )
            await self._ws.broadcast(
                "agent:sub_updated",
                {"id": agent_id, "progress": progress},
            )

    async def _complete_task(
        self,
        task_id: str,
        task_title: str,
        agent_id: str,
        queue_type: str,
        result_text: str | None,
        cost_usd: float,
    ):
        """Handle successful task completion with queue-type routing."""
        now = datetime.now(timezone.utc)

        async with self._session_factory() as session:
            task_svc = TaskService(session)
            agent_svc = AgentService(session)

            if queue_type == "auto":
                # Auto queue -> directly done
                task = await task_svc.update_fields(
                    task_id,
                    status=TaskStatus.DONE,
                    progress=100,
                    completed_at=now,
                    result=result_text,
                )
                if task:
                    await task_svc.archive_to_history(task, "done")
                event_msg = f'\u2705 "{task_title}" \u6267\u884c\u5b8c\u6210'
                event_type = EventType.DONE

            elif queue_type == "semi":
                # Semi queue -> enter review
                task = await task_svc.update_fields(
                    task_id,
                    status=TaskStatus.REVIEW,
                    progress=100,
                    result=result_text,
                )
                event_msg = f'"{task_title}" \u5b8c\u6210\uff0c\u8fdb\u5165\u9a8c\u6536\u961f\u5217'
                event_type = EventType.REVIEW

                # Add notification for semi tasks
                from app.models.activity import Notification
                notif = Notification(
                    id=str(uuid.uuid4())[:8],
                    message=f'"{task_title}" \u7b49\u5f85\u9a8c\u6536',
                    task_id=task_id,
                )
                session.add(notif)
                await session.commit()
                await self._ws.broadcast(
                    "activity:notification",
                    {
                        "id": notif.id,
                        "timestamp": int(now.timestamp() * 1000),
                        "message": notif.message,
                        "read": False,
                        "taskId": task_id,
                    },
                )

            else:
                # Human queue -> done (human was in the loop the whole time)
                task = await task_svc.update_fields(
                    task_id,
                    status=TaskStatus.DONE,
                    progress=100,
                    completed_at=now,
                    result=result_text,
                )
                if task:
                    await task_svc.archive_to_history(task, "done")
                event_msg = f'\u2705 "{task_title}" \u534f\u4f5c\u5b8c\u6210'
                event_type = EventType.DONE

            # Free the sub-agent
            await agent_svc.free_agent(agent_id)

            # Broadcast all updates
            if task:
                await self._ws.broadcast(
                    "task:updated",
                    TaskResponse.from_model(task).model_dump(),
                )
            await self._ws.broadcast(
                "agent:sub_updated",
                {
                    "id": agent_id,
                    "status": "idle",
                    "current_task_id": None,
                    "current_task_title": None,
                    "progress": 0,
                },
            )
            await self._ws.broadcast(
                "activity:event",
                {
                    "id": str(uuid.uuid4())[:8],
                    "timestamp": int(now.timestamp() * 1000),
                    "type": event_type.value,
                    "message": event_msg,
                },
            )

            # Log decision
            await agent_svc.add_decision(
                f'{event_msg} (cost: ${cost_usd:.4f})'
            )

        logger.info(
            "Task '%s' completed (queue=%s, cost=$%.4f)",
            task_title, queue_type, cost_usd,
        )

    async def _fail_task(
        self,
        task_id: str,
        task_title: str,
        agent_id: str,
        error_msg: str,
    ):
        """Handle task failure with retry logic."""
        now = datetime.now(timezone.utc)

        async with self._session_factory() as session:
            task_svc = TaskService(session)
            agent_svc = AgentService(session)

            task = await task_svc.get_by_id(task_id)
            if not task:
                return

            if task.retry_count < task.max_retries:
                # Retry: re-queue the task
                task.retry_count += 1
                task.status = TaskStatus.QUEUED
                task.progress = 0
                task.assigned_agent = None
                task.error_message = error_msg
                task.subprocess_pid = None
                await session.commit()
                await session.refresh(task)

                event_msg = (
                    f'\u26a0\ufe0f "{task_title}" \u6267\u884c\u5931\u8d25\uff0c\u5c06\u91cd\u8bd5 '
                    f'({task.retry_count}/{task.max_retries}): {error_msg[:100]}'
                )
                decision_msg = (
                    f'\u4efb\u52a1 "{task_title}" \u5931\u8d25\uff0c\u5b89\u6392\u7b2c {task.retry_count} \u6b21\u91cd\u8bd5'
                )
            else:
                # Max retries exceeded -> mark as failed
                task.status = TaskStatus.FAILED
                task.error_message = error_msg
                task.completed_at = now
                task.subprocess_pid = None
                await session.commit()
                await session.refresh(task)

                await task_svc.archive_to_history(task, "failed")
                event_msg = f'\u274c "{task_title}" \u6700\u7ec8\u5931\u8d25: {error_msg[:100]}'
                decision_msg = f'\u4efb\u52a1 "{task_title}" \u91cd\u8bd5\u8017\u5c3d\uff0c\u6807\u8bb0\u4e3a\u5931\u8d25'

            # Free the sub-agent
            await agent_svc.free_agent(agent_id)

            # Broadcast
            await self._ws.broadcast(
                "task:updated",
                TaskResponse.from_model(task).model_dump(),
            )
            await self._ws.broadcast(
                "agent:sub_updated",
                {
                    "id": agent_id,
                    "status": "idle",
                    "current_task_id": None,
                    "current_task_title": None,
                    "progress": 0,
                },
            )
            await self._ws.broadcast(
                "activity:event",
                {
                    "id": str(uuid.uuid4())[:8],
                    "timestamp": int(now.timestamp() * 1000),
                    "type": "failed",
                    "message": event_msg,
                },
            )
            await agent_svc.add_decision(decision_msg)

        logger.warning("Task '%s' failed: %s", task_title, error_msg)

    # ------------------------------------------------------------------
    # Uptime loop
    # ------------------------------------------------------------------

    async def _uptime_loop(self):
        """Broadcast main agent uptime every second."""
        while not self._stopped:
            try:
                if self._started_at:
                    elapsed = (
                        datetime.now(timezone.utc) - self._started_at
                    ).total_seconds()
                    await self._ws.broadcast(
                        "agent:main_updated",
                        {
                            "status": "active",
                            "uptimeSeconds": int(elapsed),
                            "model": settings.claude_model or "claude-code",
                        },
                    )
            except Exception:
                pass  # never crash on heartbeat failure
            await asyncio.sleep(1)

    # ------------------------------------------------------------------
    # Public API -- called from routes
    # ------------------------------------------------------------------

    async def cancel_task(self, task_id: str) -> bool:
        """Cancel a running task by killing its CLI subprocess."""
        killed = await self._runner.kill_process(task_id)
        # The _run_agent coroutine's finally block will handle agent cleanup
        return killed

    @property
    def active_runner_count(self) -> int:
        return self._runner.active_count
