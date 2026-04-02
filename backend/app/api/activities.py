from fastapi import APIRouter, Depends
from sqlalchemy import select, desc, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.activity import ActivityEvent, Notification
from app.schemas.activity import ActivityEventResponse, NotificationResponse

router = APIRouter()


@router.get("/events", response_model=list[ActivityEventResponse])
async def list_events(limit: int = 50, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ActivityEvent).order_by(desc(ActivityEvent.timestamp)).limit(limit)
    )
    events = result.scalars().all()
    return [ActivityEventResponse.from_model(e) for e in events]


@router.get("/notifications", response_model=list[NotificationResponse])
async def list_notifications(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Notification).order_by(desc(Notification.timestamp)).limit(20)
    )
    notifications = result.scalars().all()
    return [NotificationResponse.from_model(n) for n in notifications]


@router.post("/notifications/read-all", status_code=204)
async def mark_all_read(db: AsyncSession = Depends(get_db)):
    await db.execute(update(Notification).values(read=True))
    await db.commit()
