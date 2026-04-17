"""
Priority-based task scheduler.

Picks the next tasks to dispatch from the queued pool.
P0 > P1 > P2 > P3, ties broken by created_at (FIFO).
Human-queue tasks are excluded from automatic dispatch.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.task import Task

from app.models.enums import QueueType, Priority

logger = logging.getLogger(__name__)

# Priority ordering (lower index = higher priority)
_PRIORITY_ORDER = {
    Priority.P0: 0,
    Priority.P1: 1,
    Priority.P2: 2,
    Priority.P3: 3,
}


class PriorityScheduler:
    """
    Stateless scheduler -- given a list of queued tasks and a dispatch budget,
    returns the next tasks to run.
    """

    @staticmethod
    def pick_next_tasks(
        queued_tasks: list[Task],
        max_dispatch: int = 2,
        exclude_task_ids: set[str] | None = None,
    ) -> list[Task]:
        """
        Select up to ``max_dispatch`` tasks from the queued pool.

        Rules:
        1. Skip human-queue tasks (they need manual trigger)
        2. Skip tasks in *exclude_task_ids* (already being dispatched this tick)
        3. Sort by priority (P0 first), then by created_at (oldest first)
        4. Return at most *max_dispatch* tasks
        """
        exclude = exclude_task_ids or set()

        eligible = [
            t for t in queued_tasks
            if t.queue_type != QueueType.HUMAN
            and t.id not in exclude
        ]

        # Sort: priority rank ascending, then created_at ascending
        eligible.sort(
            key=lambda t: (
                _PRIORITY_ORDER.get(t.priority, 99),
                t.created_at or datetime.min,
            )
        )

        selected = eligible[:max_dispatch]

        if selected:
            logger.debug(
                "Scheduler picked %d task(s): %s",
                len(selected),
                [(t.id, t.priority.value) for t in selected],
            )

        return selected
