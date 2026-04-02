from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.activity import ActivityEvent, Notification


class ActivityEventResponse(BaseModel):
    id: str
    timestamp: datetime | None = None
    type: str
    message: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, event: ActivityEvent) -> ActivityEventResponse:
        return cls(
            id=event.id,
            timestamp=event.timestamp,
            type=event.type.value if event.type else "info",
            message=event.message,
        )


class NotificationResponse(BaseModel):
    id: str
    timestamp: datetime | None = None
    message: str
    read: bool = False
    task_id: str | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, n: Notification) -> NotificationResponse:
        return cls(
            id=n.id,
            timestamp=n.timestamp,
            message=n.message,
            read=n.read,
            task_id=n.task_id,
        )
