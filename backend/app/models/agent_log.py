"""
AgentLog — persists every AgentEvent emitted by Claude CLI subprocesses.

Each row represents one event (tool_use, text, result, error) so the full
execution trace of a task can be replayed later.
"""

from datetime import datetime

from sqlalchemy import String, Integer, Text, DateTime, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AgentLog(Base):
    __tablename__ = "agent_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agent_id: Mapped[str] = mapped_column(String(50), index=True)
    task_id: Mapped[str | None] = mapped_column(String(36), index=True)
    event_type: Mapped[str] = mapped_column(String(20))  # tool_use, text, result, error, progress
    message: Mapped[str] = mapped_column(Text, default="")
    tool_name: Mapped[str | None] = mapped_column(String(100))
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float | None] = mapped_column(default=None)
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True,
    )
