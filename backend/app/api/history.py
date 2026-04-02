from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta

from app.api.deps import get_db
from app.models.history import HistoryEntry
from app.models.enums import QueueType
from app.schemas.history import HistoryEntryResponse, HistoryStatsResponse, HistoryListResponse

router = APIRouter()

TIME_RANGES = {
    "today": timedelta(days=1),
    "yesterday": timedelta(days=2),
    "week": timedelta(weeks=1),
    "month": timedelta(days=30),
}


@router.get("", response_model=HistoryListResponse)
async def list_history(
    time_range: str = Query("today"),
    queue_type: str = Query("all"),
    status: str = Query("all"),
    db: AsyncSession = Depends(get_db),
):
    cutoff = datetime.now(timezone.utc) - TIME_RANGES.get(time_range, timedelta(days=1))
    query = select(HistoryEntry).where(HistoryEntry.completed_at >= cutoff)

    if queue_type != "all":
        query = query.where(HistoryEntry.queue_type == QueueType(queue_type))
    if status != "all":
        query = query.where(HistoryEntry.status == status)

    query = query.order_by(desc(HistoryEntry.completed_at))
    result = await db.execute(query)
    entries = list(result.scalars().all())

    # Compute stats
    total = len(entries)
    done_count = sum(1 for e in entries if e.status == "done")
    failed_count = sum(1 for e in entries if e.status == "failed")
    avg_duration = int(sum(e.duration for e in entries) / total) if total > 0 else 0
    success_rate = round((done_count / total) * 100, 1) if total > 0 else 0

    return HistoryListResponse(
        entries=[HistoryEntryResponse.from_model(e) for e in entries],
        stats=HistoryStatsResponse(
            total=total,
            successRate=success_rate,
            avgDuration=avg_duration,
            failedCount=failed_count,
        ),
    )
