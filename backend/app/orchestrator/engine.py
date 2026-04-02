"""
Orchestrator — replaces MockSimulator's 5 setInterval loops with real
Claude Agent SDK execution.

Three async background loops:
  1. Dispatcher  — assigns queued tasks to idle/new sub-agents (poll interval)
  2. Monitor     — not needed as a separate loop; TaskRunner pushes events
  3. Uptime      — tracks main-agent uptime + broadcasts heartbeat (1 s)

TaskRunner instances run concurrently, each driving one Claude session.
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
from app.services.claude_service import ClaudeAgentRunner, AgentEvent, AgentEventType
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
        self._tasks: list[asyncio.Task] = []  # background asyncio tasks
        self._runners: dict[str, ClaudeAgentRunner] = {}  # agent_id → runner
        self._runner_tasks: dict[str, asyncio.Task] = {}  # agent_id → asyncio task
        self._started_at: datetime | None = None
        self._stopped = False

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

        self._tasks.append(asyncio.create_task(self._dispatch_loop()))
        self._tasks.append(asyncio.create_task(self._uptime_loop()))

        logger.info(
            "Orchestrator started (poll=%.1fs, max_agents=%d)",
            settings.orchestrator_poll_interval,
            settings.max_concurrent_agents,
        )

    async def stop(self):
        """Gracefully shut down all loops and running agents."""
        self._stopped = True
        logger.info("Orchestrator shutting down...")

        # Cancel all agent runners
        for agent_id, runner in self._runners.items():
            runner.cancel()
            logger.info("Cancelled runner for agent %s", agent_id)

        # Wait for runner tasks to complete
        for agent_id, task in self._runner_tasks.items():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        # Cancel background loops
        for task in self._tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        # Set main agent to idle
        async with self._session_factory() as session:
            svc = AgentService(session)
            await svc.update_main_agent(status=AgentStatus.IDLE)

        self._tasks.clear()
        self._runners.clear()
        self._runner_tasks.clear()
        logger.info("Orchestrator stopped.")

    # ------------------------------------------------------------------
    # Dispatch loop — find queued tasks, assign to agents
    # ------------------------------------------------------------------

    async def _dispatch_loop(self):
        """Periodically check for queued tasks and dispatch them."""
        while not self._stopped:
            try:
                await self._dispatch_once()
            except Exception:
                logger.exception("Error in dispatch loop")
            await asyncio.sleep(settings.orchestrator_poll_interval)

    async def _dispatch_once(self):
        """Single dispatch iteration."""
        async with self._session_factory() as session:
            task_svc = TaskService(session)
            agent_svc = AgentService(session)

            # Get queued tasks (ordered by priority)
            queued = await task_svc.get_by_status("queued")
            if not queued:
                return

            for task in queued:
                if self._stopped:
                    break

                # Get or create an idle sub-agent
                agent = await agent_svc.get_or_create_idle_agent(
                    max_agents=settings.max_concurrent_agents
                )
                if not agent:
                    # All agents busy, wait for next poll
                    logger.debug("No idle agents available, %d queued", len(queued))
                    break

                # Assign task to agent
                now = datetime.now(timezone.utc)
                task.status = TaskStatus.RUNNING
                task.assigned_agent = agent.id
                task.started_at = now

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
                    f'将 "{task.title}" 分配给 {agent.id} '
                    f'(队列: {task.queue_type.value}, 优先级: {task.priority.value})'
                )
                await agent_svc.increment_dispatched()

                # Update main agent current decision
                await agent_svc.update_main_agent(
                    current_decision=f'正在调度: "{task.title}" → {agent.id}',
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
                        "message": f'主 Agent 将 "{task.title}" 分配给 {agent.id}',
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

                # Launch the runner in background
                self._start_runner(task.id, task.title, task.description, agent.id, task.queue_type.value)

                logger.info(
                    "Dispatched task '%s' (%s) to agent %s",
                    task.title, task.id, agent.id,
                )

    # ------------------------------------------------------------------
    # Task runner management
    # ------------------------------------------------------------------

    def _start_runner(
        self,
        task_id: str,
        task_title: str,
        task_description: str | None,
        agent_id: str,
        queue_type: str,
    ):
        """Spawn a TaskRunner as a background asyncio.Task."""
        # Build prompt
        prompt = self._build_task_prompt(task_title, task_description)

        runner = ClaudeAgentRunner(
            task_id=task_id,
            prompt=prompt,
            working_dir=settings.effective_working_dir,
            max_turns=settings.claude_max_turns,
        )
        self._runners[agent_id] = runner

        async_task = asyncio.create_task(
            self._run_agent(runner, task_id, task_title, agent_id, queue_type)
        )
        self._runner_tasks[agent_id] = async_task

    def _build_task_prompt(self, title: str, description: str | None) -> str:
        """Build the prompt for the Claude agent."""
        parts = [f"# 任务: {title}"]
        if description:
            parts.append(f"\n{description}")
        parts.append(
            "\n请完成上述任务。完成后用中文简要总结你做了什么。"
        )
        return "\n".join(parts)

    async def _run_agent(
        self,
        runner: ClaudeAgentRunner,
        task_id: str,
        task_title: str,
        agent_id: str,
        queue_type: str,
    ):
        """
        Consume events from a ClaudeAgentRunner and update DB + WS.
        This runs as a standalone asyncio.Task.
        """
        last_progress = 0

        try:
            async for event in runner.run():
                if self._stopped:
                    break

                if event.type == AgentEventType.PROGRESS or event.type == AgentEventType.TOOL_USE:
                    # Update progress
                    if event.progress_pct > last_progress:
                        last_progress = event.progress_pct
                        await self._update_progress(
                            task_id, agent_id, event.progress_pct, event.message
                        )

                elif event.type == AgentEventType.TEXT:
                    # Text output — just update progress if it advanced
                    if event.progress_pct > last_progress:
                        last_progress = event.progress_pct
                        await self._update_progress(
                            task_id, agent_id, event.progress_pct, event.message
                        )

                elif event.type == AgentEventType.RESULT:
                    # Task completed successfully
                    await self._complete_task(
                        task_id, task_title, agent_id, queue_type,
                        event.result_text, event.cost_usd,
                    )

                elif event.type == AgentEventType.ERROR:
                    # Task failed
                    await self._fail_task(
                        task_id, task_title, agent_id, event.message,
                    )

        except asyncio.CancelledError:
            logger.info("Runner for agent %s cancelled", agent_id)
        except Exception:
            logger.exception("Unexpected error in runner for agent %s", agent_id)
            await self._fail_task(
                task_id, task_title, agent_id, "Runner 内部异常",
            )
        finally:
            # Cleanup
            self._runners.pop(agent_id, None)
            self._runner_tasks.pop(agent_id, None)

    # ------------------------------------------------------------------
    # DB + WS update helpers
    # ------------------------------------------------------------------

    async def _update_progress(
        self, task_id: str, agent_id: str, progress: int, message: str,
    ):
        """Push a progress update to DB and WS."""
        async with self._session_factory() as session:
            task_svc = TaskService(session)
            agent_svc = AgentService(session)

            task = await task_svc.update_fields(task_id, progress=progress)
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
                # Auto queue → directly done
                task = await task_svc.update_fields(
                    task_id,
                    status=TaskStatus.DONE,
                    progress=100,
                    completed_at=now,
                    result=result_text,
                )
                if task:
                    await task_svc.archive_to_history(task, "done")

                event_msg = f'✅ "{task_title}" 执行完成'
                event_type = EventType.DONE

            elif queue_type == "semi":
                # Semi queue → enter review
                task = await task_svc.update_fields(
                    task_id,
                    status=TaskStatus.REVIEW,
                    progress=100,
                    result=result_text,
                )
                event_msg = f'"{task_title}" 完成，进入验收队列'
                event_type = EventType.REVIEW

                # Add notification for semi tasks
                from app.models.activity import Notification
                notif = Notification(
                    id=str(uuid.uuid4())[:8],
                    message=f'"{task_title}" 等待验收',
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
                # Human queue → done (human was in the loop the whole time)
                task = await task_svc.update_fields(
                    task_id,
                    status=TaskStatus.DONE,
                    progress=100,
                    completed_at=now,
                    result=result_text,
                )
                if task:
                    await task_svc.archive_to_history(task, "done")
                event_msg = f'✅ "{task_title}" 协作完成'
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
                    "id": agent_id, "status": "idle",
                    "current_task_id": None, "current_task_title": None,
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
            "Task '%s' completed (queue=%s, cost=$%.4f)", task_title, queue_type, cost_usd,
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
                await session.commit()
                await session.refresh(task)

                event_msg = (
                    f'⚠️ "{task_title}" 执行失败，将重试 '
                    f'({task.retry_count}/{task.max_retries}): {error_msg[:100]}'
                )
                decision_msg = f'任务 "{task_title}" 失败，安排第 {task.retry_count} 次重试'
            else:
                # Max retries exceeded → mark as failed
                task.status = TaskStatus.FAILED
                task.error_message = error_msg
                task.completed_at = now
                await session.commit()
                await session.refresh(task)

                await task_svc.archive_to_history(task, "failed")
                event_msg = f'❌ "{task_title}" 最终失败: {error_msg[:100]}'
                decision_msg = f'任务 "{task_title}" 重试耗尽，标记为失败'

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
                    "id": agent_id, "status": "idle",
                    "current_task_id": None, "current_task_title": None,
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
    # Public API — called from routes
    # ------------------------------------------------------------------

    async def cancel_task(self, task_id: str) -> bool:
        """Cancel a running task by finding its agent runner."""
        for agent_id, runner in self._runners.items():
            if runner.task_id == task_id:
                runner.cancel()
                return True
        return False

    @property
    def active_runner_count(self) -> int:
        return len(self._runners)
