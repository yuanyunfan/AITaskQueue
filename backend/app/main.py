import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from fastapi import Depends

from app.api import health, tasks, agents, activities, history, chat
from app.api.deps import verify_api_key
from app.ws.handler import ws_router
from app.ws.manager import ws_manager
from app.database import AsyncSessionLocal
from app.orchestrator import Orchestrator

logger = logging.getLogger(__name__)

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    orchestrator: Orchestrator | None = None

    if settings.orchestrator_enabled:
        orchestrator = Orchestrator(
            session_factory=AsyncSessionLocal,
            ws_manager=ws_manager,
        )
        await orchestrator.start()
        app.state.orchestrator = orchestrator
        logger.info("Orchestrator is running")
    else:
        app.state.orchestrator = None
        logger.info("Orchestrator disabled (AITASK_ORCHESTRATOR_ENABLED=false)")

    yield

    if orchestrator:
        await orchestrator.stop()
        logger.info("Orchestrator stopped")


app = FastAPI(
    title="AITaskQueue",
    version="0.2.0",
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
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"], dependencies=[Depends(verify_api_key)])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"], dependencies=[Depends(verify_api_key)])
app.include_router(activities.router, prefix="/api/activities", tags=["activities"], dependencies=[Depends(verify_api_key)])
app.include_router(history.router, prefix="/api/history", tags=["history"], dependencies=[Depends(verify_api_key)])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"], dependencies=[Depends(verify_api_key)])

# WebSocket
app.include_router(ws_router)
