from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta, date

from app.api.deps import get_db
from app.models.history import HistoryEntry
from app.models.enums import QueueType
from app.schemas.history import HistoryEntryResponse, HistoryStatsResponse, HistoryListResponse

router = APIRouter()


def _get_time_bounds(time_range: str) -> tuple[datetime, datetime | None]:
    """Return (start, end) datetime bounds for the given time range.

    For 'today' and 'yesterday', use midnight boundaries.
    For 'week' and 'month', use a simple cutoff from now.
    Returns (start, None) when there is no upper bound.
    """
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)

    if time_range == "today":
        return today_start, None
    elif time_range == "yesterday":
        return today_start - timedelta(days=1), today_start
    elif time_range == "week":
        return now - timedelta(weeks=1), None
    elif time_range == "month":
        return now - timedelta(days=30), None
    else:
        return today_start, None


@router.get("", response_model=HistoryListResponse)
async def list_history(
    time_range: str = Query("today"),
    queue_type: str = Query("all"),
    status: str = Query("all"),
    db: AsyncSession = Depends(get_db),
):
    start, end = _get_time_bounds(time_range)
    query = select(HistoryEntry).where(HistoryEntry.completed_at >= start)
    if end is not None:
        query = query.where(HistoryEntry.completed_at < end)

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
