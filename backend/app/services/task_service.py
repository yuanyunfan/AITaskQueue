import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.models.enums import TaskStatus, QueueType, Priority
from app.models.history import HistoryEntry
from app.models.activity import ActivityEvent, Notification
from app.models.enums import EventType


class TaskService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_active(self) -> list[Task]:
        result = await self.session.execute(
            select(Task).where(Task.status != TaskStatus.DONE).order_by(Task.sort_order, Task.created_at)
        )
        return list(result.scalars().all())

    async def list_all(self) -> list[Task]:
        result = await self.session.execute(
            select(Task).order_by(Task.sort_order, Task.created_at)
        )
        return list(result.scalars().all())

    async def get_children(self, parent_id: str) -> list[Task]:
        result = await self.session.execute(
            select(Task).where(Task.parent_id == parent_id).order_by(Task.sort_order, Task.created_at)
        )
        return list(result.scalars().all())

    async def get_projects(self) -> list[str]:
        result = await self.session.execute(
            select(Task.project).where(Task.project.isnot(None)).distinct().order_by(Task.project)
        )
        return [r[0] for r in result.all()]

    async def get_by_id(self, task_id: str) -> Task | None:
        result = await self.session.execute(select(Task).where(Task.id == task_id))
        return result.scalar_one_or_none()

    async def get_by_status(self, status: str) -> list[Task]:
        result = await self.session.execute(
            select(Task).where(Task.status == TaskStatus(status)).order_by(Task.priority, Task.created_at)
        )
        return list(result.scalars().all())

    async def create(self, title: str, description: str | None, queue_type: str, priority: str, estimated_minutes: int | None = None, project: str | None = None, parent_id: str | None = None) -> Task:
        task = Task(
            id=str(uuid.uuid4())[:8],
            title=title,
            description=description,
            project=project,
            parent_id=parent_id,
            status=TaskStatus.BLOCKED,
            queue_type=QueueType(queue_type),
            priority=Priority(priority),
            estimated_minutes=estimated_minutes,
        )
        self.session.add(task)

        # Add activity event
        event = ActivityEvent(
            id=str(uuid.uuid4())[:8],
            type=EventType.INFO,
            message=f'新任务入队: "{title}"',
        )
        self.session.add(event)

        await self.session.commit()
        await self.session.refresh(task)
        return task

    async def update_fields(self, task_id: str, **kwargs) -> Task | None:
        task = await self.get_by_id(task_id)
        if not task:
            return None
        for key, value in kwargs.items():
            if value is not None and hasattr(task, key):
                setattr(task, key, value)
        await self.session.commit()
        await self.session.refresh(task)
        return task

    async def delete(self, task_id: str) -> bool:
        task = await self.get_by_id(task_id)
        if not task:
            return False
        await self.session.delete(task)
        await self.session.commit()
        return True

    async def approve(self, task_id: str) -> Task | None:
        task = await self.get_by_id(task_id)
        if not task or task.status != TaskStatus.REVIEW:
            return None
        task.status = TaskStatus.DONE
        task.completed_at = datetime.now(timezone.utc)

        # Create history entry
        duration = 0
        if task.started_at and task.completed_at:
            duration = int((task.completed_at - task.started_at).total_seconds())
        history = HistoryEntry(
            id=task.id,
            title=task.title,
            queue_type=task.queue_type,
            status="done",
            duration=duration,
            completed_at=task.completed_at,
            note="验收通过 ✓",
        )
        self.session.add(history)

        event = ActivityEvent(
            id=str(uuid.uuid4())[:8],
            type=EventType.DONE,
            message=f'✅ "{task.title}" 验收通过',
        )
        self.session.add(event)

        await self.session.commit()
        await self.session.refresh(task)
        return task

    async def reject(self, task_id: str) -> Task | None:
        task = await self.get_by_id(task_id)
        if not task or task.status != TaskStatus.REVIEW:
            return None
        task.status = TaskStatus.QUEUED
        task.progress = 0
        task.assigned_agent = None

        event = ActivityEvent(
            id=str(uuid.uuid4())[:8],
            type=EventType.INFO,
            message=f'"{task.title}" 被打回，重新入队',
        )
        self.session.add(event)

        await self.session.commit()
        await self.session.refresh(task)
        return task

    async def pause(self, task_id: str) -> Task | None:
        task = await self.get_by_id(task_id)
        if not task or task.status != TaskStatus.RUNNING:
            return None
        task.status = TaskStatus.PAUSED
        await self.session.commit()
        await self.session.refresh(task)
        return task

    async def resume(self, task_id: str) -> Task | None:
        task = await self.get_by_id(task_id)
        if not task or task.status != TaskStatus.PAUSED:
            return None
        task.status = TaskStatus.QUEUED
        task.progress = 0
        task.assigned_agent = None
        await self.session.commit()
        await self.session.refresh(task)
        return task

    async def reorder(self, queue_type: str, task_ids: list[str]) -> None:
        for i, tid in enumerate(task_ids):
            await self.session.execute(
                update(Task).where(Task.id == tid).values(sort_order=i)
            )
        await self.session.commit()

    async def archive_to_history(self, task: Task, status: str = "done") -> None:
        duration = 0
        if task.started_at and task.completed_at:
            duration = int((task.completed_at - task.started_at).total_seconds())
        entry = HistoryEntry(
            id=task.id,
            title=task.title,
            queue_type=task.queue_type,
            status=status,
            duration=duration,
            completed_at=task.completed_at or datetime.now(timezone.utc),
        )
        self.session.add(entry)
        await self.session.commit()
