from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.api.deps import get_db
from app.services.agent_service import AgentService
from app.schemas.agent import MainAgentResponse, SubAgentResponse, DecisionLogResponse

router = APIRouter()


@router.get("/main", response_model=MainAgentResponse)
async def get_main_agent(db: AsyncSession = Depends(get_db)):
    svc = AgentService(db)
    agent = await svc.get_main_agent()
    uptime = 0
    if agent.started_at:
        uptime = int((datetime.now(timezone.utc) - agent.started_at).total_seconds())
    return MainAgentResponse.from_model(agent, uptime_seconds=uptime)


@router.get("/subs", response_model=list[SubAgentResponse])
async def list_sub_agents(db: AsyncSession = Depends(get_db)):
    svc = AgentService(db)
    agents = await svc.list_sub_agents()
    return [SubAgentResponse.from_model(a) for a in agents]


@router.get("/decisions", response_model=list[DecisionLogResponse])
async def get_decisions(limit: int = 50, db: AsyncSession = Depends(get_db)):
    svc = AgentService(db)
    entries = await svc.get_decisions(limit=limit)
    return [DecisionLogResponse.from_model(e) for e in entries]


@router.delete("/subs/{agent_id}", status_code=204)
async def delete_sub_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    svc = AgentService(db)
    deleted = await svc.delete_sub_agent(agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Sub-agent not found")
