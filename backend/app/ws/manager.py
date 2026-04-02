import asyncio
import json
from datetime import datetime, timezone

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections and broadcasts."""

    def __init__(self):
        self._connections: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._connections.append(ws)

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            if ws in self._connections:
                self._connections.remove(ws)

    async def broadcast(self, msg_type: str, payload: dict):
        message = json.dumps({
            "type": msg_type,
            "payload": payload,
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        }, default=str)
        async with self._lock:
            dead: list[WebSocket] = []
            for ws in self._connections:
                try:
                    await ws.send_text(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self._connections.remove(ws)

    @property
    def active_count(self) -> int:
        return len(self._connections)


ws_manager = ConnectionManager()
