"""
Chat API — sends user messages to a real Claude session via Agent SDK.

The chat uses a lightweight single-turn query (max_turns=1, no tools)
so Claude acts as a conversational assistant that knows about the current
task queue state.
"""

import uuid
import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.chat import ChatMessage
from app.models.enums import TaskStatus
from app.models.task import Task
from app.schemas.chat import ChatMessageCreate, ChatMessageResponse
from app.ws.manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter()


async def _build_system_context(session: AsyncSession) -> str:
    """Build a system context with current task queue state."""
    result = await session.execute(
        select(Task).where(Task.status != TaskStatus.DONE)
    )
    tasks = list(result.scalars().all())

    queued = [t for t in tasks if t.status == TaskStatus.QUEUED]
    running = [t for t in tasks if t.status == TaskStatus.RUNNING]
    review = [t for t in tasks if t.status == TaskStatus.REVIEW]
    failed = [t for t in tasks if t.status == TaskStatus.FAILED]
    paused = [t for t in tasks if t.status == TaskStatus.PAUSED]

    lines = [
        "你是 AITaskQueue 的主 Agent 助手。当前任务队列状态:",
        f"- 排队中: {len(queued)} 个",
        f"- 运行中: {len(running)} 个",
        f"- 待验收: {len(review)} 个",
        f"- 已失败: {len(failed)} 个",
        f"- 已暂停: {len(paused)} 个",
    ]

    if running:
        lines.append("\n运行中的任务:")
        for t in running:
            lines.append(f"  - {t.title} (进度 {t.progress}%, 分配给 {t.assigned_agent})")

    if queued:
        lines.append("\n排队中的任务:")
        for t in queued[:5]:
            lines.append(f"  - {t.title} ({t.priority.value}, {t.queue_type.value})")
        if len(queued) > 5:
            lines.append(f"  ... 还有 {len(queued) - 5} 个")

    lines.append("\n用中文回答用户的问题。简洁直接。")
    return "\n".join(lines)


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

    user_resp = ChatMessageResponse.from_model(msg)
    await ws_manager.broadcast("chat:message", user_resp.model_dump())

    # Build context-aware prompt and call Claude
    try:
        system_context = await _build_system_context(db)
        assistant_content = await _query_claude(data.content, system_context)
    except Exception as exc:
        logger.error("Claude chat query failed: %s", exc)
        assistant_content = f"抱歉，Claude 响应出错: {str(exc)[:200]}"

    # Save assistant message
    assistant_msg = ChatMessage(
        id=str(uuid.uuid4())[:8],
        role="assistant",
        content=assistant_content,
    )
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)

    assistant_resp = ChatMessageResponse.from_model(assistant_msg)
    await ws_manager.broadcast("chat:message", assistant_resp.model_dump())

    return user_resp


async def _query_claude(user_message: str, system_context: str) -> str:
    """
    Single-turn Claude query for chat responses.
    Uses Agent SDK with no tools and max_turns=1 for fast conversational reply.
    """
    from claude_agent_sdk import query, ClaudeAgentOptions

    opts = ClaudeAgentOptions(
        max_turns=1,
        system_prompt=system_context,
        allowed_tools=[],  # no tools — pure conversation
    )

    result_text = ""
    async for message in query(prompt=user_message, options=opts):
        msg_type = getattr(message, "type", None)
        if msg_type == "assistant":
            content = getattr(message, "message", None)
            if content and hasattr(content, "content"):
                for block in content.content:
                    if hasattr(block, "text"):
                        result_text += block.text
        elif msg_type == "result":
            result = getattr(message, "result", "")
            if result and not result_text:
                result_text = result

    return result_text or "（Claude 未返回内容）"
