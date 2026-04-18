import asyncio
import json
from datetime import datetime, timezone

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections and broadcasts."""

    def __init__(self):
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._connections.add(ws)

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self._connections.discard(ws)

    async def broadcast(self, msg_type: str, payload: dict):
        message = json.dumps({
            "type": msg_type,
            "payload": payload,
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        }, default=str)
        async with self._lock:
            snapshot = set(self._connections)

        async def _send(ws: WebSocket) -> WebSocket | None:
            try:
                await asyncio.wait_for(ws.send_text(message), timeout=5.0)
            except Exception:
                return ws
            return None

        results = await asyncio.gather(*(_send(ws) for ws in snapshot))
        dead = {ws for ws in results if ws is not None}
        if dead:
            async with self._lock:
                self._connections -= dead

    @property
    def active_count(self) -> int:
        return len(self._connections)


ws_manager = ConnectionManager()
