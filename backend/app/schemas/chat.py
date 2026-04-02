from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.chat import ChatMessage


class ChatMessageCreate(BaseModel):
    content: str


class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    timestamp: datetime | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, msg: ChatMessage) -> ChatMessageResponse:
        return cls(
            id=msg.id,
            role=msg.role,
            content=msg.content,
            timestamp=msg.timestamp,
        )
