from datetime import datetime

from sqlalchemy import String, Integer, Text, Enum, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import QueueType


class HistoryEntry(Base):
    __tablename__ = "history_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    queue_type: Mapped[QueueType] = mapped_column(Enum(QueueType), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    duration: Mapped[int] = mapped_column(Integer, default=0)
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    note: Mapped[str | None] = mapped_column(Text)
