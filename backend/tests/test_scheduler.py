"""
Unit tests for PriorityScheduler — no DB or async required.
"""

from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock

import pytest

from app.orchestrator.scheduler import PriorityScheduler
from app.models.enums import QueueType, Priority, TaskStatus


def _make_task(
    task_id: str,
    priority: Priority = Priority.P2,
    queue_type: QueueType = QueueType.AUTO,
    created_offset_min: int = 0,
) -> MagicMock:
    """Create a mock Task with the fields PriorityScheduler reads."""
    t = MagicMock()
    t.id = task_id
    t.priority = priority
    t.queue_type = queue_type
    t.status = TaskStatus.QUEUED
    t.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(
        minutes=created_offset_min
    )
    return t


class TestPriorityScheduler:
    """Test the stateless PriorityScheduler.pick_next_tasks()."""

    def test_empty_list_returns_empty(self):
        result = PriorityScheduler.pick_next_tasks([], max_dispatch=5)
        assert result == []

    def test_p0_before_p1(self):
        tasks = [
            _make_task("t1", Priority.P1),
            _make_task("t2", Priority.P0),
        ]
        result = PriorityScheduler.pick_next_tasks(tasks, max_dispatch=2)
        assert [t.id for t in result] == ["t2", "t1"]

    def test_priority_ordering_full(self):
        tasks = [
            _make_task("t3", Priority.P3),
            _make_task("t1", Priority.P1),
            _make_task("t0", Priority.P0),
            _make_task("t2", Priority.P2),
        ]
        result = PriorityScheduler.pick_next_tasks(tasks, max_dispatch=10)
        assert [t.id for t in result] == ["t0", "t1", "t2", "t3"]

    def test_same_priority_fifo_by_created_at(self):
        tasks = [
            _make_task("newer", Priority.P1, created_offset_min=10),
            _make_task("older", Priority.P1, created_offset_min=0),
        ]
        result = PriorityScheduler.pick_next_tasks(tasks, max_dispatch=2)
        assert [t.id for t in result] == ["older", "newer"]

    def test_human_queue_skipped(self):
        tasks = [
            _make_task("auto1", Priority.P0, QueueType.AUTO),
            _make_task("human1", Priority.P0, QueueType.HUMAN),
            _make_task("semi1", Priority.P0, QueueType.SEMI),
        ]
        result = PriorityScheduler.pick_next_tasks(tasks, max_dispatch=10)
        ids = [t.id for t in result]
        assert "human1" not in ids
        assert "auto1" in ids
        assert "semi1" in ids

    def test_max_dispatch_limits_output(self):
        tasks = [_make_task(f"t{i}", Priority.P1) for i in range(10)]
        result = PriorityScheduler.pick_next_tasks(tasks, max_dispatch=3)
        assert len(result) == 3

    def test_max_dispatch_one(self):
        tasks = [
            _make_task("t0", Priority.P0),
            _make_task("t1", Priority.P1),
        ]
        result = PriorityScheduler.pick_next_tasks(tasks, max_dispatch=1)
        assert len(result) == 1
        assert result[0].id == "t0"

    def test_exclude_task_ids(self):
        tasks = [
            _make_task("t0", Priority.P0),
            _make_task("t1", Priority.P1),
            _make_task("t2", Priority.P2),
        ]
        result = PriorityScheduler.pick_next_tasks(
            tasks, max_dispatch=10, exclude_task_ids={"t0", "t2"}
        )
        assert [t.id for t in result] == ["t1"]

    def test_exclude_all_returns_empty(self):
        tasks = [_make_task("t0"), _make_task("t1")]
        result = PriorityScheduler.pick_next_tasks(
            tasks, max_dispatch=10, exclude_task_ids={"t0", "t1"}
        )
        assert result == []

    def test_mixed_priority_and_human_filter(self):
        """P0 human should be skipped; P2 auto should rank after P1 semi."""
        tasks = [
            _make_task("p0-human", Priority.P0, QueueType.HUMAN),
            _make_task("p2-auto", Priority.P2, QueueType.AUTO),
            _make_task("p1-semi", Priority.P1, QueueType.SEMI),
        ]
        result = PriorityScheduler.pick_next_tasks(tasks, max_dispatch=5)
        assert [t.id for t in result] == ["p1-semi", "p2-auto"]
