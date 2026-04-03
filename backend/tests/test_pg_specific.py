"""
PostgreSQL-specific tests — catches bugs that SQLite misses.

Covers Bug#2 (missing columns) and Bug#3 (history entry duplicate key).

Run with: TEST_DB=postgres pytest tests/test_pg_specific.py -x -v
Requires Docker to be running.
"""

import os
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.database import Base
from app.main import app as fastapi_app
from app.api.deps import get_db
import app.models  # noqa: F401


# Skip entire module if TEST_DB != postgres
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(
        os.getenv("TEST_DB") != "postgres",
        reason="PostgreSQL tests: set TEST_DB=postgres to run",
    ),
]


# ---------------------------------------------------------------------------
# Fixtures — real PostgreSQL via testcontainers
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def pg_container():
    """Start a PostgreSQL container for the test module."""
    from testcontainers.postgres import PostgresContainer

    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest_asyncio.fixture
async def pg_engine(pg_container):
    """Create async engine pointing to test container."""
    # testcontainers gives us a psycopg2 URL, convert to asyncpg
    sync_url = pg_container.get_connection_url()
    async_url = sync_url.replace("psycopg2", "asyncpg")

    engine = create_async_engine(async_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def pg_session_factory(pg_engine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        pg_engine, class_=AsyncSession, expire_on_commit=False,
    )


@pytest_asyncio.fixture
async def pg_client(pg_session_factory) -> AsyncClient:
    async def _override():
        async with pg_session_factory() as session:
            yield session

    fastapi_app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=fastapi_app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    fastapi_app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _create_task(client: AsyncClient, **extra) -> dict:
    payload = {"title": "PG Test Task", "queueType": "semi", "priority": "p2", **extra}
    resp = await client.post("/api/tasks", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestPGEnumHandling:
    """Bug#2: Enum values must work correctly in PostgreSQL."""

    async def test_create_task_with_all_enum_values(self, pg_client):
        """All TaskStatus, QueueType, Priority values should be valid in PG."""
        for qt in ["auto", "semi", "human"]:
            for p in ["p0", "p1", "p2", "p3"]:
                data = await _create_task(pg_client, queueType=qt, priority=p)
                assert data["queueType"] == qt
                assert data["priority"] == p

    async def test_patch_status_lowercase(self, pg_client):
        """PATCH with lowercase status must work (not raise enum error)."""
        data = await _create_task(pg_client)
        task_id = data["id"]

        for status in ["blocked", "queued"]:
            resp = await pg_client.patch(f"/api/tasks/{task_id}", json={"status": status})
            assert resp.status_code == 200, f"Failed to set status={status}: {resp.text}"
            assert resp.json()["status"] == status

    async def test_patch_all_fields_together(self, pg_client):
        """PATCH with title + status + priority + queueType together."""
        data = await _create_task(pg_client)
        task_id = data["id"]

        resp = await pg_client.patch(f"/api/tasks/{task_id}", json={
            "title": "Updated Title",
            "status": "queued",
            "priority": "p0",
            "queueType": "auto",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["title"] == "Updated Title"
        assert body["status"] == "queued"
        assert body["priority"] == "p0"
        assert body["queueType"] == "auto"


class TestPGHistoryDuplicate:
    """Bug#3: approve with existing history entry must not crash."""

    async def test_approve_with_existing_history_entry(self, pg_client):
        """Approve a task that already has a failed history entry (from retries)."""
        # 1. Create task
        data = await _create_task(pg_client, queueType="semi")
        task_id = data["id"]

        # 2. Move to review status (simulate: blocked → queued → running → review)
        await pg_client.post(f"/api/tasks/{task_id}/unblock")
        await pg_client.patch(f"/api/tasks/{task_id}", json={"status": "running"})
        await pg_client.patch(f"/api/tasks/{task_id}", json={"status": "review"})

        # 3. First approve — creates history entry
        resp = await pg_client.post(f"/api/tasks/{task_id}/approve")
        assert resp.status_code == 200
        assert resp.json()["status"] == "done"

    async def test_approve_idempotent(self, pg_client):
        """Approving an already-done task should return 400, not crash."""
        data = await _create_task(pg_client, queueType="semi")
        task_id = data["id"]

        # Move to review
        await pg_client.post(f"/api/tasks/{task_id}/unblock")
        await pg_client.patch(f"/api/tasks/{task_id}", json={"status": "review"})

        # First approve
        resp = await pg_client.post(f"/api/tasks/{task_id}/approve")
        assert resp.status_code == 200

        # Second approve — task is now done, not review → should 400
        resp = await pg_client.post(f"/api/tasks/{task_id}/approve")
        assert resp.status_code == 400


class TestPGSchemaIntegrity:
    """Verify all model columns exist in the real PostgreSQL schema."""

    async def test_task_has_all_columns(self, pg_client):
        """Create a task and read it back — all fields must be present."""
        data = await _create_task(pg_client, description="test desc", estimatedMinutes=30)
        task_id = data["id"]

        resp = await pg_client.get(f"/api/tasks/{task_id}")
        assert resp.status_code == 200
        body = resp.json()

        # All camelCase fields must exist
        expected_fields = [
            "id", "title", "description", "project", "parentId",
            "status", "queueType", "priority", "progress",
            "assignedAgent", "createdAt", "startedAt", "completedAt",
            "estimatedMinutes", "result", "children",
        ]
        for field in expected_fields:
            assert field in body, f"Missing field: {field}"

    async def test_list_tasks_with_project_filter(self, pg_client):
        """Project filter query must work in PG."""
        await _create_task(pg_client, project="TestProject")
        await _create_task(pg_client, title="No project")

        resp = await pg_client.get("/api/tasks", params={"project": "TestProject"})
        assert resp.status_code == 200
        tasks = resp.json()
        assert all(t.get("project") == "TestProject" for t in tasks)
