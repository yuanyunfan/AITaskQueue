from __future__ import annotations

from pydantic import BaseModel

from app.models.chat import ChatMessage


class ChatMessageCreate(BaseModel):
    content: str


class ChatMessageResponse(BaseModel):
    """Frontend-facing chat message response with epoch ms timestamp."""
    id: str
    role: str
    content: str
    timestamp: int = 0  # epoch ms

    @classmethod
    def from_model(cls, msg: ChatMessage) -> ChatMessageResponse:
        ts = 0
        if msg.timestamp:
            ts = int(msg.timestamp.timestamp() * 1000)
        return cls(
            id=msg.id,
            role=msg.role,
            content=msg.content,
            timestamp=ts,
        )
