import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.chat import ChatMessage
from app.schemas.chat import ChatMessageCreate, ChatMessageResponse
from app.ws.manager import ws_manager

router = APIRouter()


@router.get("/messages", response_model=list[ChatMessageResponse])
async def list_messages(limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatMessage).order_by(desc(ChatMessage.timestamp)).limit(limit)
    )
    messages = list(result.scalars().all())
    messages.reverse()  # oldest first
    return [ChatMessageResponse.from_model(m) for m in messages]


@router.post("/messages", response_model=ChatMessageResponse, status_code=201)
async def send_message(data: ChatMessageCreate, db: AsyncSession = Depends(get_db)):
    # Save user message
    msg = ChatMessage(
        id=str(uuid.uuid4())[:8],
        role="user",
        content=data.content,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    resp = ChatMessageResponse.from_model(msg)
    await ws_manager.broadcast("chat:message", resp.model_dump())

    # TODO: Phase 5 — spawn Claude CLI for agent response
    # For now, echo a placeholder response
    assistant_msg = ChatMessage(
        id=str(uuid.uuid4())[:8],
        role="assistant",
        content=f"收到你的消息。Claude CLI 集成将在后续阶段实现。",
    )
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)

    assistant_resp = ChatMessageResponse.from_model(assistant_msg)
    await ws_manager.broadcast("chat:message", assistant_resp.model_dump())

    return resp
