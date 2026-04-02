from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.task_service import TaskService
from app.schemas.task import TaskCreate, TaskUpdate, TaskResponse, ReorderRequest
from app.ws.manager import ws_manager

router = APIRouter()


@router.get("/projects")
async def list_projects(db: AsyncSession = Depends(get_db)):
    """Get distinct project names."""
    svc = TaskService(db)
    return await svc.get_projects()


@router.get("")
async def list_tasks(project: str | None = Query(None), db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    tasks = await svc.list_all()
    # Filter by project if specified
    if project == "__none__":
        tasks = [t for t in tasks if t.project is None]
    elif project:
        tasks = [t for t in tasks if t.project == project]
    # Build parent→children map
    parent_ids = {t.id for t in tasks if any(c.parent_id == t.id for c in tasks)}
    children_map: dict[str, list] = {}
    top_level = []
    for t in tasks:
        if t.parent_id:
            children_map.setdefault(t.parent_id, []).append(t)
        else:
            top_level.append(t)
    result = []
    for t in top_level:
        kids = children_map.get(t.id)
        result.append(TaskResponse.from_model(t, children=kids).model_dump())
    return result


@router.get("/{task_id}")
async def get_task(task_id: str, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    task = await svc.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    children = await svc.get_children(task_id)
    return TaskResponse.from_model(task, children=children if children else None).model_dump()


@router.post("", status_code=201)
async def create_task(data: TaskCreate, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    task = await svc.create(
        title=data.title,
        description=data.description,
        queue_type=data.queue_type,
        priority=data.priority,
        estimated_minutes=data.estimated_minutes,
        project=data.project,
        parent_id=data.parent_id,
    )
    resp = TaskResponse.from_model(task).model_dump()
    await ws_manager.broadcast("task:created", resp)
    return resp


@router.patch("/{task_id}")
async def update_task(task_id: str, data: TaskUpdate, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    updates = data.model_dump(exclude_none=True)
    if "queue_type" in updates:
        updates["queue_type"] = updates.pop("queue_type")
    task = await svc.update_fields(task_id, **updates)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    resp = TaskResponse.from_model(task).model_dump()
    await ws_manager.broadcast("task:updated", resp)
    return resp


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: str, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    deleted = await svc.delete(task_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Task not found")
    await ws_manager.broadcast("task:deleted", {"id": task_id})


@router.post("/{task_id}/approve")
async def approve_task(task_id: str, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    task = await svc.approve(task_id)
    if not task:
        raise HTTPException(status_code=400, detail="Task not in review status")
    resp = TaskResponse.from_model(task).model_dump()
    await ws_manager.broadcast("task:updated", resp)
    return resp


@router.post("/{task_id}/reject")
async def reject_task(task_id: str, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    task = await svc.reject(task_id)
    if not task:
        raise HTTPException(status_code=400, detail="Task not in review status")
    resp = TaskResponse.from_model(task).model_dump()
    await ws_manager.broadcast("task:updated", resp)
    return resp


@router.post("/{task_id}/pause")
async def pause_task(task_id: str, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    task = await svc.pause(task_id)
    if not task:
        raise HTTPException(status_code=400, detail="Task not running")
    resp = TaskResponse.from_model(task).model_dump()
    await ws_manager.broadcast("task:updated", resp)
    return resp


@router.post("/{task_id}/resume")
async def resume_task(task_id: str, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    task = await svc.resume(task_id)
    if not task:
        raise HTTPException(status_code=400, detail="Task not paused")
    resp = TaskResponse.from_model(task).model_dump()
    await ws_manager.broadcast("task:updated", resp)
    return resp


@router.post("/{task_id}/unblock")
async def unblock_task(task_id: str, db: AsyncSession = Depends(get_db)):
    """Move task from blocked → queued so orchestrator can pick it up."""
    svc = TaskService(db)
    task = await svc.get_by_id(task_id)
    if not task or task.status.value != 'blocked':
        raise HTTPException(status_code=400, detail="Task not in blocked status")
    task = await svc.update_fields(task_id, status='QUEUED')
    resp = TaskResponse.from_model(task).model_dump()
    await ws_manager.broadcast("task:updated", resp)
    return resp


@router.post("/{task_id}/block")
async def block_task(task_id: str, db: AsyncSession = Depends(get_db)):
    """Move task back to blocked status."""
    svc = TaskService(db)
    task = await svc.get_by_id(task_id)
    if not task or task.status.value not in ('queued', 'paused'):
        raise HTTPException(status_code=400, detail="Task must be queued or paused to block")
    task = await svc.update_fields(task_id, status='BLOCKED')
    resp = TaskResponse.from_model(task).model_dump()
    await ws_manager.broadcast("task:updated", resp)
    return resp


@router.post("/reorder", status_code=204)
async def reorder_tasks(data: ReorderRequest, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    await svc.reorder(data.queue_type, data.task_ids)


@router.get("/stale", response_model=list[dict])
async def list_stale_tasks(db: AsyncSession = Depends(get_db)):
    """List tasks that appear stale (RUNNING but no activity for a long time)."""
    svc = TaskService(db)
    stale = await svc.get_stale_tasks()
    return [TaskResponse.from_model(t).model_dump() for t in stale]


@router.post("/{task_id}/reset-stale")
async def reset_stale_task(task_id: str, db: AsyncSession = Depends(get_db)):
    """Manually reset a stale RUNNING task back to QUEUED."""
    svc = TaskService(db)
    task = await svc.reset_stale_task(task_id)
    if not task:
        raise HTTPException(status_code=400, detail="Task not in running status or not found")
    resp = TaskResponse.from_model(task).model_dump()
    await ws_manager.broadcast("task:updated", resp)
    return resp
