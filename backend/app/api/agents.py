from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.api.deps import get_db
from app.services.agent_service import AgentService
from app.schemas.agent import MainAgentResponse, SubAgentResponse, DecisionLogResponse
from app.schemas.agent_log import AgentLogResponse
from app.ws.manager import ws_manager

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


@router.post("/subs/{agent_id}/stop")
async def stop_sub_agent(agent_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Stop a running sub-agent by killing its CLI subprocess."""
    svc = AgentService(db)
    agent = await svc.get_sub_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Sub-agent not found")
    if not agent.current_task_id:
        raise HTTPException(status_code=400, detail="Agent has no running task")

    # Kill the subprocess via orchestrator
    orchestrator = request.app.state.orchestrator
    if orchestrator:
        await orchestrator.cancel_task(agent.current_task_id)

    # The _run_agent coroutine will handle cleanup (fail_task -> free_agent)
    # But broadcast an immediate agent update for responsive UI
    await ws_manager.broadcast("agent:sub_updated", {
        "id": agent_id,
        "status": "idle",
        "currentTaskId": None,
        "currentTaskTitle": None,
        "progress": 0,
    })
    return {"status": "stopped", "agentId": agent_id}


@router.delete("/subs/{agent_id}", status_code=204)
async def delete_sub_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    svc = AgentService(db)
    deleted = await svc.delete_sub_agent(agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Sub-agent not found")


@router.get("/subs/{agent_id}/logs", response_model=list[AgentLogResponse])
async def get_agent_logs(
    agent_id: str,
    task_id: str | None = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    """Fetch execution logs for a sub-agent, optionally filtered by task."""
    svc = AgentService(db)
    logs = await svc.get_logs(agent_id, task_id=task_id, limit=limit)
    return [AgentLogResponse.from_model(log) for log in logs]
