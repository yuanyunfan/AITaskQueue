from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ws.manager import ws_manager

ws_router = APIRouter()


@ws_router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    try:
        while True:
            data = await ws.receive_text()
            # Handle client messages (ping, chat:send, etc.)
            # For now, just keep the connection alive
    except WebSocketDisconnect:
        await ws_manager.disconnect(ws)
