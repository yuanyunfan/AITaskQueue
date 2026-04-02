"""
Integration tests for Task REST API endpoints.

Uses httpx.AsyncClient + in-memory SQLite (see conftest.py).
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _create_task(
    client: AsyncClient,
    title: str = "Test Task",
    queue_type: str = "auto",
    priority: str = "p2",
    **extra,
) -> dict:
    """Create a task and return the JSON response body."""
    payload = {"title": title, "queueType": queue_type, "priority": priority, **extra}
    resp = await client.post("/api/tasks", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


class TestTaskCRUD:

    async def test_create_task_returns_201(self, client: AsyncClient):
        data = await _create_task(client, title="Create test")
        assert data["title"] == "Create test"
        assert data["status"] == "blocked"
        assert data["queueType"] == "auto"
        assert data["priority"] == "p2"
        assert data["progress"] == 0
        assert isinstance(data["id"], str)
        assert isinstance(data["createdAt"], int)

    async def test_create_task_with_all_fields(self, client: AsyncClient):
        data = await _create_task(
            client,
            title="Full task",
            queue_type="semi",
            priority="p0",
            description="A detailed description",
            estimatedMinutes=30,
        )
        assert data["queueType"] == "semi"
        assert data["priority"] == "p0"
        assert data["description"] == "A detailed description"
        assert data["estimatedMinutes"] == 30

    async def test_list_tasks(self, client: AsyncClient):
        await _create_task(client, title="List A")
        await _create_task(client, title="List B")
        resp = await client.get("/api/tasks")
        assert resp.status_code == 200
        tasks = resp.json()
        titles = [t["title"] for t in tasks]
        assert "List A" in titles
        assert "List B" in titles

    async def test_get_task_by_id(self, client: AsyncClient):
        data = await _create_task(client, title="Get by ID")
        resp = await client.get(f"/api/tasks/{data['id']}")
        assert resp.status_code == 200
        assert resp.json()["title"] == "Get by ID"

    async def test_get_task_not_found(self, client: AsyncClient):
        resp = await client.get("/api/tasks/nonexistent")
        assert resp.status_code == 404

    async def test_patch_task(self, client: AsyncClient):
        data = await _create_task(client, title="Before update")
        resp = await client.patch(
            f"/api/tasks/{data['id']}",
            json={"title": "After update"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "After update"

    async def test_delete_task(self, client: AsyncClient):
        data = await _create_task(client, title="To delete")
        resp = await client.delete(f"/api/tasks/{data['id']}")
        assert resp.status_code == 204
        # Verify it's gone
        resp2 = await client.get(f"/api/tasks/{data['id']}")
        assert resp2.status_code == 404

    async def test_delete_nonexistent(self, client: AsyncClient):
        resp = await client.delete("/api/tasks/nonexistent")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# State transitions: unblock / block
# ---------------------------------------------------------------------------


class TestTaskStateTransitions:

    async def test_unblock_task(self, client: AsyncClient):
        """blocked → queued via POST /unblock."""
        data = await _create_task(client, title="Unblock me")
        assert data["status"] == "blocked"
        resp = await client.post(f"/api/tasks/{data['id']}/unblock")
        assert resp.status_code == 200
        assert resp.json()["status"] == "queued"

    async def test_unblock_non_blocked_returns_400(self, client: AsyncClient):
        """Only blocked tasks can be unblocked."""
        data = await _create_task(client, title="Not blocked")
        # Unblock first
        await client.post(f"/api/tasks/{data['id']}/unblock")
        # Try again — now queued, not blocked
        resp = await client.post(f"/api/tasks/{data['id']}/unblock")
        assert resp.status_code == 400

    async def test_block_queued_task(self, client: AsyncClient):
        """queued → blocked via POST /block."""
        data = await _create_task(client, title="Block me")
        await client.post(f"/api/tasks/{data['id']}/unblock")
        resp = await client.post(f"/api/tasks/{data['id']}/block")
        assert resp.status_code == 200
        assert resp.json()["status"] == "blocked"

    async def test_block_blocked_returns_400(self, client: AsyncClient):
        """Can't block a task that's already blocked."""
        data = await _create_task(client, title="Already blocked")
        resp = await client.post(f"/api/tasks/{data['id']}/block")
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# State transitions: approve / reject (require review status)
# ---------------------------------------------------------------------------


class TestTaskApproveReject:

    async def _make_review_task(self, client: AsyncClient) -> dict:
        """Create a task and move it to review status via PATCH (simulate)."""
        data = await _create_task(client, title="Review task", queue_type="semi")
        # Directly patch status to review (simulating orchestrator completion)
        resp = await client.patch(
            f"/api/tasks/{data['id']}",
            json={"status": "review"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "review"
        return resp.json()

    async def test_approve_review_task(self, client: AsyncClient):
        data = await self._make_review_task(client)
        resp = await client.post(f"/api/tasks/{data['id']}/approve")
        assert resp.status_code == 200
        assert resp.json()["status"] == "done"

    async def test_approve_non_review_returns_400(self, client: AsyncClient):
        data = await _create_task(client, title="Not review")
        resp = await client.post(f"/api/tasks/{data['id']}/approve")
        assert resp.status_code == 400

    async def test_reject_review_task(self, client: AsyncClient):
        data = await self._make_review_task(client)
        resp = await client.post(f"/api/tasks/{data['id']}/reject")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "queued"
        assert body["progress"] == 0

    async def test_reject_non_review_returns_400(self, client: AsyncClient):
        data = await _create_task(client, title="Not review")
        resp = await client.post(f"/api/tasks/{data['id']}/reject")
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# State transitions: pause / resume (require running / paused)
# ---------------------------------------------------------------------------


class TestTaskPauseResume:

    async def _make_running_task(self, client: AsyncClient) -> dict:
        data = await _create_task(client, title="Running task")
        resp = await client.patch(
            f"/api/tasks/{data['id']}",
            json={"status": "running"},
        )
        assert resp.status_code == 200
        return resp.json()

    async def test_pause_running_task(self, client: AsyncClient):
        data = await self._make_running_task(client)
        resp = await client.post(f"/api/tasks/{data['id']}/pause")
        assert resp.status_code == 200
        assert resp.json()["status"] == "paused"

    async def test_pause_non_running_returns_400(self, client: AsyncClient):
        data = await _create_task(client, title="Not running")
        resp = await client.post(f"/api/tasks/{data['id']}/pause")
        assert resp.status_code == 400

    async def test_resume_paused_task(self, client: AsyncClient):
        data = await self._make_running_task(client)
        await client.post(f"/api/tasks/{data['id']}/pause")
        resp = await client.post(f"/api/tasks/{data['id']}/resume")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "queued"
        assert body["progress"] == 0

    async def test_resume_non_paused_returns_400(self, client: AsyncClient):
        data = await _create_task(client, title="Not paused")
        resp = await client.post(f"/api/tasks/{data['id']}/resume")
        assert resp.status_code == 400
