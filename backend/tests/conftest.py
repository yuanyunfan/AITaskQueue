"""
Shared test fixtures — async SQLite engine, session, FastAPI test client.
"""

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.database import Base
import app.models  # noqa: F401  — register all models with Base.metadata


# ---------------------------------------------------------------------------
# In-memory SQLite async engine + tables
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def async_engine():
    """Create an in-memory SQLite engine and initialise all tables."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def async_session(async_engine) -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional async session that rolls back after each test."""
    factory = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False,
    )
    async with factory() as session:
        yield session


@pytest_asyncio.fixture
async def session_factory(async_engine) -> async_sessionmaker[AsyncSession]:
    """Return a session factory bound to the test engine."""
    return async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False,
    )


# ---------------------------------------------------------------------------
# FastAPI test client (overrides DB dependency)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def client(session_factory) -> AsyncGenerator[AsyncClient, None]:
    """
    httpx.AsyncClient wired to the FastAPI app with the test DB.
    """
    from app.main import app
    from app.api.deps import get_db

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
