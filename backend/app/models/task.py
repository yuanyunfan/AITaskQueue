from datetime import datetime

from sqlalchemy import String, Text, Integer, Enum, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import TaskStatus, QueueType, Priority


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus), default=TaskStatus.QUEUED, index=True
    )
    queue_type: Mapped[QueueType] = mapped_column(
        Enum(QueueType), nullable=False, index=True
    )
    priority: Mapped[Priority] = mapped_column(
        Enum(Priority), default=Priority.P2, index=True
    )
    progress: Mapped[int] = mapped_column(Integer, default=0)
    assigned_agent: Mapped[str | None] = mapped_column(String(50))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    estimated_minutes: Mapped[int | None] = mapped_column(Integer)
    result: Mapped[str | None] = mapped_column(Text)

    # Orchestrator metadata
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=3)
    error_message: Mapped[str | None] = mapped_column(Text)
    subprocess_pid: Mapped[int | None] = mapped_column(Integer)
