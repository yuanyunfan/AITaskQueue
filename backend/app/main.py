from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api import health, tasks, agents, activities, history, chat
from app.ws.handler import ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: orchestrator will be started here in Phase 5
    yield
    # Shutdown: orchestrator will be stopped here in Phase 5


app = FastAPI(
    title="AITaskQueue",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routes
app.include_router(health.router, prefix="/api")
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(activities.router, prefix="/api/activities", tags=["activities"])
app.include_router(history.router, prefix="/api/history", tags=["history"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])

# WebSocket
app.include_router(ws_router)
