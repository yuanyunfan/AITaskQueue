from datetime import datetime

from sqlalchemy import String, Text, Boolean, Enum, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import EventType


class ActivityEvent(Base):
    __tablename__ = "activity_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    type: Mapped[EventType] = mapped_column(Enum(EventType), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    task_id: Mapped[str | None] = mapped_column(String(36))
