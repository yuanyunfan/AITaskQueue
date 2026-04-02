from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.task_service import TaskService
from app.schemas.task import TaskCreate, TaskUpdate, TaskResponse, ReorderRequest
from app.ws.manager import ws_manager

router = APIRouter()


@router.get("")
async def list_tasks(db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    tasks = await svc.list_all()
    return [TaskResponse.from_model(t).model_dump() for t in tasks]


@router.get("/{task_id}")
async def get_task(task_id: str, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    task = await svc.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskResponse.from_model(task).model_dump()


@router.post("", status_code=201)
async def create_task(data: TaskCreate, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    task = await svc.create(
        title=data.title,
        description=data.description,
        queue_type=data.queue_type,
        priority=data.priority,
        estimated_minutes=data.estimated_minutes,
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
    await ws_manager.broadcast("task:updated", {"id": task_id, "changes": resp})
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
    await ws_manager.broadcast("task:updated", {"id": task_id, "changes": resp})
    return resp


@router.post("/{task_id}/reject")
async def reject_task(task_id: str, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    task = await svc.reject(task_id)
    if not task:
        raise HTTPException(status_code=400, detail="Task not in review status")
    resp = TaskResponse.from_model(task).model_dump()
    await ws_manager.broadcast("task:updated", {"id": task_id, "changes": resp})
    return resp


@router.post("/{task_id}/pause")
async def pause_task(task_id: str, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    task = await svc.pause(task_id)
    if not task:
        raise HTTPException(status_code=400, detail="Task not running")
    resp = TaskResponse.from_model(task).model_dump()
    await ws_manager.broadcast("task:updated", {"id": task_id, "changes": resp})
    return resp


@router.post("/{task_id}/resume")
async def resume_task(task_id: str, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    task = await svc.resume(task_id)
    if not task:
        raise HTTPException(status_code=400, detail="Task not paused")
    resp = TaskResponse.from_model(task).model_dump()
    await ws_manager.broadcast("task:updated", {"id": task_id, "changes": resp})
    return resp


@router.post("/reorder", status_code=204)
async def reorder_tasks(data: ReorderRequest, db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    await svc.reorder(data.queue_type, data.task_ids)
