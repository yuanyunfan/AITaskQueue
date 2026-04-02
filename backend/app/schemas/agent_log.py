"""Pydantic response schema for AgentLog — camelCase output for frontend."""

from __future__ import annotations

from pydantic import BaseModel

from app.models.agent_log import AgentLog


class AgentLogResponse(BaseModel):
    id: str
    agentId: str
    taskId: str | None = None
    eventType: str
    message: str
    toolName: str | None = None
    progressPct: int = 0
    costUsd: float | None = None
    metadata: dict | None = None
    timestamp: int = 0  # epoch ms

    @classmethod
    def from_model(cls, log: AgentLog) -> AgentLogResponse:
        ts = 0
        if log.timestamp:
            ts = int(log.timestamp.timestamp() * 1000)
        return cls(
            id=log.id,
            agentId=log.agent_id,
            taskId=log.task_id,
            eventType=log.event_type,
            message=log.message,
            toolName=log.tool_name,
            progressPct=log.progress_pct,
            costUsd=log.cost_usd,
            metadata=log.metadata_json,
            timestamp=ts,
        )
