"""
WebSocket handler — bidirectional communication with frontend.

Server → Client: broadcasts from orchestrator (task:updated, agent:*, activity:*, chat:*)
Client → Server: chat:send, task:action, ping
"""

import hmac
import json
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.config import settings
from app.ws.manager import ws_manager
from app.database import AsyncSessionLocal
from app.services.task_service import TaskService
from app.schemas.task import TaskResponse

logger = logging.getLogger(__name__)

ws_router = APIRouter()


@ws_router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, api_key: str = Query(default=None)):
    # Security note: When AITASK_API_KEY is not configured (empty), any client
    # can connect and perform task mutations (pause, resume, approve, reject)
    # via task:action messages. Set AITASK_API_KEY to a non-empty value in
    # production to enforce authentication on both connect and task actions.
    if settings.api_key:
        if not api_key or not hmac.compare_digest(api_key, settings.api_key):
            await ws.accept()
            await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or missing API key")
            return

    await ws_manager.connect(ws)
    logger.info("WebSocket client connected (total: %d)", ws_manager.active_count)

    # Send initial full sync
    try:
        await _send_full_sync(ws)
    except Exception:
        logger.exception("Failed to send full sync")

    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
                msg_type = data.get("type", "")
                payload = data.get("payload", {})

                if msg_type == "ping":
                    await ws.send_text(json.dumps({"type": "pong"}))

                elif msg_type == "task:action":
                    await _handle_task_action(ws, payload)

                else:
                    logger.debug("Unknown WS message type: %s", msg_type)

            except json.JSONDecodeError:
                logger.warning("Invalid JSON from WS client: %s", raw[:100])

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected (total: %d)", ws_manager.active_count - 1)
    except Exception:
        logger.exception("Unexpected error in WebSocket handler")
    finally:
        await ws_manager.disconnect(ws)


async def _send_full_sync(ws: WebSocket):
    """Send the current state to a newly connected client."""
    from app.services.agent_service import AgentService
    from app.models.activity import ActivityEvent as ActivityModel
    from app.models.activity import Notification as NotifModel
    from app.models.chat import ChatMessage as ChatModel
    from app.models.history import HistoryEntry as HistoryModel
    from app.models.agent_log import AgentLog
    from app.schemas.agent import MainAgentResponse, SubAgentResponse, DecisionLogResponse
    from app.schemas.agent_log import AgentLogResponse
    from sqlalchemy import select, desc

    async with AsyncSessionLocal() as session:
        # Tasks
        task_svc = TaskService(session)
        tasks = await task_svc.list_all()
        tasks_data = [TaskResponse.from_model(t).model_dump() for t in tasks]

        # Agents
        agent_svc = AgentService(session)
        main_agent = await agent_svc.get_main_agent()
        sub_agents = await agent_svc.list_sub_agents()

        # Agent logs — recent logs for all agents (not just active)
        agent_logs_data: list[dict] = []
        for agent in sub_agents:
            logs = await agent_svc.get_logs(agent.id, limit=100)
            agent_logs_data.extend(
                AgentLogResponse.from_model(log).model_dump() for log in logs
            )

        # Recent activity events
        result = await session.execute(
            select(ActivityModel).order_by(desc(ActivityModel.timestamp)).limit(50)
        )
        events = list(result.scalars().all())
        events.reverse()
        events_data = [
            {
                "id": e.id,
                "timestamp": int(e.timestamp.timestamp() * 1000) if e.timestamp else 0,
                "type": e.type.value if hasattr(e.type, "value") else e.type,
                "message": e.message,
            }
            for e in events
        ]

        # Notifications
        result = await session.execute(
            select(NotifModel).order_by(desc(NotifModel.timestamp)).limit(20)
        )
        notifs = list(result.scalars().all())
        notifs.reverse()
        notifs_data = [
            {
                "id": n.id,
                "timestamp": int(n.timestamp.timestamp() * 1000) if n.timestamp else 0,
                "message": n.message,
                "read": n.read,
                "taskId": n.task_id,
            }
            for n in notifs
        ]

        # Chat messages
        result = await session.execute(
            select(ChatModel).order_by(desc(ChatModel.timestamp)).limit(50)
        )
        chats = list(result.scalars().all())
        chats.reverse()
        chats_data = [
            {
                "id": c.id,
                "role": c.role,
                "content": c.content,
                "timestamp": int(c.timestamp.timestamp() * 1000) if c.timestamp else 0,
            }
            for c in chats
        ]

        # Decisions
        decisions = await agent_svc.get_decisions(limit=30)
        decisions_data = [DecisionLogResponse.from_model(d).model_dump() for d in reversed(decisions)]

        # History entries
        result = await session.execute(
            select(HistoryModel).order_by(desc(HistoryModel.completed_at)).limit(100)
        )
        history_entries = list(result.scalars().all())
        history_entries.reverse()
        history_data = [
            {
                "id": h.id,
                "title": h.title,
                "queueType": h.queue_type.value if hasattr(h.queue_type, "value") else h.queue_type,
                "status": h.status,
                "duration": h.duration or 0,
                "completedAt": int(h.completed_at.timestamp() * 1000) if h.completed_at else 0,
                "note": h.note,
            }
            for h in history_entries
        ]

    sync_payload = {
        "type": "state:full_sync",
        "payload": {
            "tasks": tasks_data,
            "mainAgent": MainAgentResponse.from_model(main_agent).model_dump(),
            "subAgents": [SubAgentResponse.from_model(a).model_dump() for a in sub_agents],
            "events": events_data,
            "notifications": notifs_data,
            "chatMessages": chats_data,
            "decisions": decisions_data,
            "agentLogs": agent_logs_data,
            "historyEntries": history_data,
        },
    }

    await ws.send_text(json.dumps(sync_payload, default=str))


async def _handle_task_action(ws: WebSocket, payload: dict):
    """Handle task actions from the frontend (pause, resume, approve, reject).

    Security: Authorization relies on the API key check at WebSocket connect
    time. If AITASK_API_KEY is not set, any connected client can invoke these
    mutations. Ensure AITASK_API_KEY is configured in production environments.
    """
    task_id = payload.get("taskId")
    action = payload.get("action")

    if not task_id or not action:
        return

    if not settings.api_key:
        logger.warning(
            "Processing task action '%s' on task '%s' without API key authentication. "
            "Set AITASK_API_KEY to enforce authorization.",
            action, task_id,
        )

    async with AsyncSessionLocal() as session:
        task_svc = TaskService(session)

        if action == "pause":
            task = await task_svc.pause(task_id)
            # Kill the subprocess if running; the orchestrator's finally block
            # will see PAUSED status and clean up without overwriting it.
            orchestrator = getattr(ws.app.state, 'orchestrator', None)
            if orchestrator:
                await orchestrator.cancel_task(task_id)
        elif action == "resume":
            task = await task_svc.resume(task_id)
        elif action == "approve":
            task = await task_svc.approve(task_id)
        elif action == "reject":
            task = await task_svc.reject(task_id)
        else:
            logger.warning("Unknown task action: %s", action)
            return

        if task:
            await ws_manager.broadcast(
                "task:updated",
                TaskResponse.from_model(task).model_dump(),
            )
