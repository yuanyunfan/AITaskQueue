from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    queue_type: str = Field(alias="queueType", default="auto")
    priority: str = "p2"
    estimated_minutes: int | None = Field(alias="estimatedMinutes", default=None)

    model_config = {"populate_by_name": True}


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    queue_type: str | None = Field(alias="queueType", default=None)

    model_config = {"populate_by_name": True}


class ReorderRequest(BaseModel):
    queue_type: str = Field(alias="queueType")
    task_ids: list[str] = Field(alias="taskIds")

    model_config = {"populate_by_name": True}


class TaskResponse(BaseModel):
    """Frontend-facing task response with camelCase field names."""
    id: str
    title: str
    description: str | None = None
    status: str
    queueType: str
    priority: str
    progress: int
    assignedAgent: str | None = None
    createdAt: int  # epoch ms
    startedAt: int | None = None
    completedAt: int | None = None
    estimatedMinutes: int | None = None
    result: str | None = None

    @classmethod
    def from_model(cls, task) -> "TaskResponse":
        return cls(
            id=task.id,
            title=task.title,
            description=task.description,
            status=task.status.value if hasattr(task.status, 'value') else task.status,
            queueType=task.queue_type.value if hasattr(task.queue_type, 'value') else task.queue_type,
            priority=task.priority.value if hasattr(task.priority, 'value') else task.priority,
            progress=task.progress,
            assignedAgent=task.assigned_agent,
            createdAt=int(task.created_at.timestamp() * 1000) if task.created_at else 0,
            startedAt=int(task.started_at.timestamp() * 1000) if task.started_at else None,
            completedAt=int(task.completed_at.timestamp() * 1000) if task.completed_at else None,
            estimatedMinutes=task.estimated_minutes,
            result=task.result,
        )
