"""
Integration tests for the Orchestrator engine.

ClaudeCodeRunner is mocked — no real Claude CLI subprocess is spawned.
Uses in-memory SQLite from conftest.py.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.enums import TaskStatus, QueueType, Priority, AgentStatus
from app.models.task import Task
from app.models.agent import MainAgentState, SubAgent
from app.orchestrator.engine import Orchestrator
from app.orchestrator.subprocess_runner import AgentEvent, AgentEventType
from app.services.task_service import TaskService
from app.services.agent_service import AgentService
from app.ws.manager import ConnectionManager


pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ws_manager() -> ConnectionManager:
    """Create a ConnectionManager with a no-op broadcast."""
    mgr = ConnectionManager()
    mgr.broadcast = AsyncMock()
    return mgr


async def _create_queued_task(
    session: AsyncSession,
    title: str = "Test task",
    queue_type: QueueType = QueueType.AUTO,
    priority: Priority = Priority.P0,
) -> Task:
    svc = TaskService(session)
    task = await svc.create(
        title=title,
        description=None,
        queue_type=queue_type.value,
        priority=priority.value,
    )
    # Move from blocked → queued
    task.status = TaskStatus.QUEUED
    await session.commit()
    await session.refresh(task)
    return task


async def _ensure_main_agent(session: AsyncSession) -> MainAgentState:
    svc = AgentService(session)
    return await svc.get_main_agent()


def _success_events(result_text: str = "Done!", cost: float = 0.01):
    """Factory for a sequence of AgentEvents ending in RESULT."""
    async def _gen(*_args, **_kwargs) -> AsyncIterator[AgentEvent]:
        yield AgentEvent(
            type=AgentEventType.TOOL_USE,
            message="Calling tool: Read",
            progress_pct=30,
            tool_name="Read",
        )
        yield AgentEvent(
            type=AgentEventType.TEXT,
            message="Working on it...",
            progress_pct=60,
        )
        yield AgentEvent(
            type=AgentEventType.RESULT,
            message="Task completed",
            progress_pct=100,
            result_text=result_text,
            cost_usd=cost,
        )
    return _gen


def _error_events(error_msg: str = "Something broke"):
    """Factory for a sequence of AgentEvents ending in ERROR."""
    async def _gen(*_args, **_kwargs) -> AsyncIterator[AgentEvent]:
        yield AgentEvent(
            type=AgentEventType.TEXT,
            message="Starting...",
            progress_pct=10,
        )
        yield AgentEvent(
            type=AgentEventType.ERROR,
            message=error_msg,
        )
    return _gen


# ---------------------------------------------------------------------------
# Orchestrator fixture
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def orchestrator(session_factory):
    ws = _make_ws_manager()
    orch = Orchestrator(session_factory=session_factory, ws_manager=ws)
    yield orch
    # Ensure stopped — cancel agent tasks first, then background loops
    orch._stopped = True
    for agent_id, t in list(orch._agent_tasks.items()):
        t.cancel()
        try:
            await t
        except (asyncio.CancelledError, Exception):
            pass
    orch._agent_tasks.clear()
    for t in orch._bg_tasks:
        t.cancel()
        try:
            await t
        except (asyncio.CancelledError, Exception):
            pass
    orch._bg_tasks.clear()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestOrchestratorTick:
    """Test the Orchestrator._tick() method in isolation."""

    async def test_tick_dispatches_queued_task(
        self, orchestrator: Orchestrator, session_factory
    ):
        """A single queued task should be dispatched on tick."""
        async with session_factory() as session:
            await _ensure_main_agent(session)
            task = await _create_queued_task(session, title="Dispatch me")

        # Mock the runner so _run_agent doesn't actually spawn a process.
        # Patch active_task_ids as a simple attribute (replace property with list).
        orchestrator._runner._processes = {}  # ensure empty → active_task_ids returns []
        with patch.object(
            orchestrator._runner,
            "spawn_streaming",
            side_effect=_success_events(),
        ), patch.object(
            orchestrator._runner, "get_pid", return_value=12345,
        ):
            await orchestrator._tick()

            # Give _run_agent asyncio.Task time to consume events and complete
            await asyncio.sleep(0.1)

        # The task should now be RUNNING (dispatched by _tick)
        async with session_factory() as session:
            svc = TaskService(session)
            updated = await svc.get_by_id(task.id)
            assert updated is not None
            # After _run_agent completes, auto task goes to DONE
            assert updated.status in (TaskStatus.RUNNING, TaskStatus.DONE)
            assert updated.assigned_agent is not None or updated.status == TaskStatus.DONE

    async def test_tick_skips_when_no_queued(
        self, orchestrator: Orchestrator, session_factory
    ):
        """No queued tasks → tick should be a no-op."""
        async with session_factory() as session:
            await _ensure_main_agent(session)

        # Should not raise
        await orchestrator._tick()

        # No agent tasks should be created
        assert len(orchestrator._agent_tasks) == 0

    async def test_tick_respects_max_concurrent(
        self, orchestrator: Orchestrator, session_factory
    ):
        """When all agent slots are full, no new tasks should be dispatched."""
        async with session_factory() as session:
            await _ensure_main_agent(session)
            await _create_queued_task(session, title="Waiting task")

        # Simulate all slots being used
        from app.config import settings
        max_agents = settings.max_concurrent_agents
        for i in range(max_agents):
            orchestrator._agent_tasks[f"fake-agent-{i}"] = MagicMock()

        await orchestrator._tick()

        # Should still only have the fake agents (no new dispatch)
        assert len(orchestrator._agent_tasks) == max_agents


class TestOrchestratorCompletion:
    """Test task completion flow through _run_agent."""

    async def test_complete_auto_task_goes_to_done(
        self, orchestrator: Orchestrator, session_factory
    ):
        """Auto queue task: running → done."""
        async with session_factory() as session:
            await _ensure_main_agent(session)
            task = await _create_queued_task(
                session, title="Auto task", queue_type=QueueType.AUTO
            )
            svc = AgentService(session)
            agent = await svc.get_or_create_idle_agent()
            assert agent is not None
            agent_id = agent.id

        with patch.object(
            orchestrator._runner,
            "spawn_streaming",
            side_effect=_success_events("Auto result"),
        ), patch.object(
            orchestrator._runner, "get_pid", return_value=99,
        ):
            await orchestrator._run_agent(
                task_id=task.id,
                task_title=task.title,
                agent_id=agent_id,
                queue_type="auto",
                prompt="test prompt",
            )

        async with session_factory() as session:
            svc = TaskService(session)
            updated = await svc.get_by_id(task.id)
            assert updated is not None
            assert updated.status == TaskStatus.DONE
            assert updated.result == "Auto result"
            assert updated.progress == 100

    async def test_complete_semi_task_goes_to_review(
        self, orchestrator: Orchestrator, session_factory
    ):
        """Semi queue task: running → review (needs human approval)."""
        async with session_factory() as session:
            await _ensure_main_agent(session)
            task = await _create_queued_task(
                session, title="Semi task", queue_type=QueueType.SEMI
            )
            svc = AgentService(session)
            agent = await svc.get_or_create_idle_agent()
            assert agent is not None
            agent_id = agent.id

        with patch.object(
            orchestrator._runner,
            "spawn_streaming",
            side_effect=_success_events("Semi result"),
        ), patch.object(
            orchestrator._runner, "get_pid", return_value=88,
        ):
            await orchestrator._run_agent(
                task_id=task.id,
                task_title=task.title,
                agent_id=agent_id,
                queue_type="semi",
                prompt="test prompt",
            )

        async with session_factory() as session:
            svc = TaskService(session)
            updated = await svc.get_by_id(task.id)
            assert updated is not None
            assert updated.status == TaskStatus.REVIEW
            assert updated.result == "Semi result"


class TestOrchestratorFailure:
    """Test task failure and retry logic."""

    async def test_fail_task_retries(
        self, orchestrator: Orchestrator, session_factory
    ):
        """Failed task with retries remaining → re-queued."""
        async with session_factory() as session:
            await _ensure_main_agent(session)
            task = await _create_queued_task(session, title="Retry task")
            # Ensure max_retries > 0
            task.max_retries = 3
            task.retry_count = 0
            await session.commit()
            svc = AgentService(session)
            agent = await svc.get_or_create_idle_agent()
            assert agent is not None
            agent_id = agent.id

        with patch.object(
            orchestrator._runner,
            "spawn_streaming",
            side_effect=_error_events("Temporary error"),
        ), patch.object(
            orchestrator._runner, "get_pid", return_value=77,
        ):
            await orchestrator._run_agent(
                task_id=task.id,
                task_title=task.title,
                agent_id=agent_id,
                queue_type="auto",
                prompt="test prompt",
            )

        async with session_factory() as session:
            svc = TaskService(session)
            updated = await svc.get_by_id(task.id)
            assert updated is not None
            assert updated.status == TaskStatus.QUEUED  # re-queued for retry
            assert updated.retry_count == 1
            assert updated.error_message == "Temporary error"

    async def test_fail_task_max_retries_exceeded(
        self, orchestrator: Orchestrator, session_factory
    ):
        """Failed task with no retries left → marked FAILED."""
        async with session_factory() as session:
            await _ensure_main_agent(session)
            task = await _create_queued_task(session, title="Final fail")
            task.max_retries = 2
            task.retry_count = 2  # already exhausted
            await session.commit()
            svc = AgentService(session)
            agent = await svc.get_or_create_idle_agent()
            assert agent is not None
            agent_id = agent.id

        with patch.object(
            orchestrator._runner,
            "spawn_streaming",
            side_effect=_error_events("Fatal error"),
        ), patch.object(
            orchestrator._runner, "get_pid", return_value=66,
        ):
            await orchestrator._run_agent(
                task_id=task.id,
                task_title=task.title,
                agent_id=agent_id,
                queue_type="auto",
                prompt="test prompt",
            )

        async with session_factory() as session:
            svc = TaskService(session)
            updated = await svc.get_by_id(task.id)
            assert updated is not None
            assert updated.status == TaskStatus.FAILED
            assert updated.error_message == "Fatal error"


class TestOrchestratorLifecycle:
    """Test start/stop lifecycle."""

    async def test_start_sets_main_agent_active(
        self, orchestrator: Orchestrator, session_factory
    ):
        """Orchestrator.start() should set main agent status to ACTIVE."""
        async with session_factory() as session:
            await _ensure_main_agent(session)

        await orchestrator.start()

        # Give the background tasks a moment to initialise, then stop cleanly
        await asyncio.sleep(0.05)
        orchestrator._stopped = True
        # Cancel background loops before calling stop() to avoid concurrent
        # SQLite access (single-connection StaticPool cannot handle parallelism).
        for t in orchestrator._bg_tasks:
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        orchestrator._bg_tasks.clear()

        # Verify main agent was set to ACTIVE
        async with session_factory() as session:
            svc = AgentService(session)
            agent = await svc.get_main_agent()
            assert agent.status == AgentStatus.ACTIVE

    async def test_stop_sets_main_agent_idle(
        self, orchestrator: Orchestrator, session_factory
    ):
        """Orchestrator.stop() should set main agent status to IDLE."""
        async with session_factory() as session:
            await _ensure_main_agent(session)

        await orchestrator.start()
        # Small sleep to ensure loops initialise
        await asyncio.sleep(0.05)
        await orchestrator.stop()

        async with session_factory() as session:
            svc = AgentService(session)
            agent = await svc.get_main_agent()
            assert agent.status == AgentStatus.IDLE

    async def test_start_resets_stale_running_tasks(
        self, orchestrator: Orchestrator, session_factory
    ):
        """On start, any RUNNING tasks from a previous crash should be reset to QUEUED."""
        async with session_factory() as session:
            await _ensure_main_agent(session)
            task = await _create_queued_task(session, title="Stale task")
            task.status = TaskStatus.RUNNING
            task.assigned_agent = "sub-01"
            await session.commit()
            task_id = task.id

        # Prevent dispatch loop from re-dispatching the reset task
        with patch.object(orchestrator, "_dispatch_loop", new_callable=AsyncMock):
            await orchestrator.start()
            await asyncio.sleep(0.05)
            orchestrator._stopped = True
            for t in orchestrator._bg_tasks:
                t.cancel()
                try:
                    await t
                except (asyncio.CancelledError, Exception):
                    pass
            orchestrator._bg_tasks.clear()

        async with session_factory() as session:
            svc = TaskService(session)
            updated = await svc.get_by_id(task_id)
            assert updated is not None
            assert updated.status == TaskStatus.QUEUED
            assert updated.assigned_agent is None
