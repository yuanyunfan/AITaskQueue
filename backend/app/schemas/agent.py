from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel

from app.models.agent import MainAgentState, SubAgent, DecisionLogEntry


class MainAgentResponse(BaseModel):
    """Frontend-facing main agent response with camelCase field names."""
    status: str
    uptimeSeconds: int = 0
    tasksDispatched: int = 0
    currentDecision: str = ""
    model: str = "claude-code"
    memoryMB: float = 0.0

    @classmethod
    def from_model(cls, agent: MainAgentState, uptime_seconds: int = 0) -> MainAgentResponse:
        return cls(
            status=agent.status.value if agent.status else "idle",
            uptimeSeconds=uptime_seconds,
            tasksDispatched=agent.tasks_dispatched,
            currentDecision=agent.current_decision,
            model=agent.model,
            memoryMB=agent.memory_mb,
        )


class SubAgentResponse(BaseModel):
    """Frontend-facing sub agent response with camelCase field names."""
    id: str
    status: str
    currentTaskId: str | None = None
    currentTaskTitle: str | None = None
    progress: int = 0
    completedCount: int = 0
    runningMinutes: float = 0

    @classmethod
    def from_model(cls, agent: SubAgent) -> SubAgentResponse:
        running_minutes = 0.0
        if agent.running_since:
            now = datetime.now(timezone.utc)
            running_since = agent.running_since
            if running_since.tzinfo is None:
                running_since = running_since.replace(tzinfo=timezone.utc)
            running_minutes = (now - running_since).total_seconds() / 60.0

        return cls(
            id=agent.id,
            status=agent.status.value if agent.status else "idle",
            currentTaskId=agent.current_task_id,
            currentTaskTitle=agent.current_task_title,
            progress=agent.progress,
            completedCount=agent.completed_count,
            runningMinutes=round(running_minutes, 1),
        )


class DecisionLogResponse(BaseModel):
    """Frontend-facing decision log response with camelCase field names."""
    id: str
    timestamp: int = 0  # epoch ms
    message: str

    @classmethod
    def from_model(cls, entry: DecisionLogEntry) -> DecisionLogResponse:
        ts = 0
        if entry.timestamp:
            ts = int(entry.timestamp.timestamp() * 1000)
        return cls(
            id=entry.id,
            timestamp=ts,
            message=entry.message,
        )
