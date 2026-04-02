from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.history import HistoryEntry


class HistoryEntryResponse(BaseModel):
    id: str
    title: str
    queue_type: str
    status: str
    duration: int = 0
    completed_at: datetime | None = None
    note: str | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, entry: HistoryEntry) -> HistoryEntryResponse:
        return cls(
            id=entry.id,
            title=entry.title,
            queue_type=entry.queue_type.value if entry.queue_type else "auto",
            status=entry.status,
            duration=entry.duration,
            completed_at=entry.completed_at,
            note=entry.note,
        )


class HistoryStatsResponse(BaseModel):
    total: int = 0
    successRate: float = 0.0
    avgDuration: int = 0
    failedCount: int = 0


class HistoryListResponse(BaseModel):
    entries: list[HistoryEntryResponse] = []
    stats: HistoryStatsResponse = HistoryStatsResponse()
