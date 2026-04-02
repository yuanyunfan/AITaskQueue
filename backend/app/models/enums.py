import enum


class TaskStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    PAUSED = "paused"
    REVIEW = "review"


class QueueType(str, enum.Enum):
    AUTO = "auto"
    SEMI = "semi"
    HUMAN = "human"


class Priority(str, enum.Enum):
    P0 = "p0"
    P1 = "p1"
    P2 = "p2"
    P3 = "p3"


class AgentStatus(str, enum.Enum):
    ACTIVE = "active"
    IDLE = "idle"
    ERROR = "error"


class EventType(str, enum.Enum):
    RUNNING = "running"
    DISPATCH = "dispatch"
    DONE = "done"
    FAILED = "failed"
    REVIEW = "review"
    INFO = "info"
