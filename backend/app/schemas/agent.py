from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.agent import MainAgentState, SubAgent, DecisionLogEntry


class MainAgentResponse(BaseModel):
    id: int
    status: str
    started_at: datetime | None = None
    tasks_dispatched: int = 0
    current_decision: str = ""
    model: str = "claude-code"
    memory_mb: float = 0.0
    uptime_seconds: int = 0

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, agent: MainAgentState, uptime_seconds: int = 0) -> MainAgentResponse:
        return cls(
            id=agent.id,
            status=agent.status.value if agent.status else "idle",
            started_at=agent.started_at,
            tasks_dispatched=agent.tasks_dispatched,
            current_decision=agent.current_decision,
            model=agent.model,
            memory_mb=agent.memory_mb,
            uptime_seconds=uptime_seconds,
        )


class SubAgentResponse(BaseModel):
    id: str
    status: str
    current_task_id: str | None = None
    current_task_title: str | None = None
    progress: int = 0
    completed_count: int = 0
    running_since: datetime | None = None
    pid: int | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, agent: SubAgent) -> SubAgentResponse:
        return cls(
            id=agent.id,
            status=agent.status.value if agent.status else "idle",
            current_task_id=agent.current_task_id,
            current_task_title=agent.current_task_title,
            progress=agent.progress,
            completed_count=agent.completed_count,
            running_since=agent.running_since,
            pid=agent.pid,
        )


class DecisionLogResponse(BaseModel):
    id: str
    timestamp: datetime | None = None
    message: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, entry: DecisionLogEntry) -> DecisionLogResponse:
        return cls(
            id=entry.id,
            timestamp=entry.timestamp,
            message=entry.message,
        )
