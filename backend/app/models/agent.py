from datetime import datetime

from sqlalchemy import String, Integer, Float, Text, Enum, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import AgentStatus


class MainAgentState(Base):
    """Singleton row — always id=1."""
    __tablename__ = "main_agent_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    status: Mapped[AgentStatus] = mapped_column(
        Enum(AgentStatus), default=AgentStatus.IDLE
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tasks_dispatched: Mapped[int] = mapped_column(Integer, default=0)
    current_decision: Mapped[str] = mapped_column(String(500), default="")
    model: Mapped[str] = mapped_column(String(50), default="claude-code")
    memory_mb: Mapped[float] = mapped_column(Float, default=0.0)


class SubAgent(Base):
    __tablename__ = "sub_agents"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    status: Mapped[AgentStatus] = mapped_column(
        Enum(AgentStatus), default=AgentStatus.IDLE
    )
    current_task_id: Mapped[str | None] = mapped_column(String(36))
    current_task_title: Mapped[str | None] = mapped_column(String(200))
    progress: Mapped[int] = mapped_column(Integer, default=0)
    completed_count: Mapped[int] = mapped_column(Integer, default=0)
    running_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pid: Mapped[int | None] = mapped_column(Integer)


class DecisionLogEntry(Base):
    __tablename__ = "decision_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
