import hmac
from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader, APIKeyQuery
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
_api_key_query = APIKeyQuery(name="api_key", auto_error=False)


async def verify_api_key(
    header_key: str | None = Security(_api_key_header),
    query_key: str | None = Security(_api_key_query),
) -> None:
    """Verify the API key if one is configured.

    When ``AITASK_API_KEY`` is empty (the default), authentication is
    disabled so that existing development workflows are not broken.
    """
    if not settings.api_key:
        # No key configured – auth disabled
        return

    provided = header_key or query_key
    if not provided or not hmac.compare_digest(provided, settings.api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
