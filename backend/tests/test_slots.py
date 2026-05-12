import pytest
from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_slot_acquire_and_push():
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Acquire
        r = await client.post(
            "/api/slot/0/acquire",
            json={"task_id": "t1", "file_path": "a.c"},
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True

        # Push
        r = await client.post(
            "/api/slot/0/push",
            json={"log_type": "stdout", "content": "hello"},
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True

        # Status
        r = await client.post(
            "/api/slot/0/status",
            json={"status": "done", "duration": 1.5},
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True

        # Release
        r = await client.post("/api/slot/0/release")
        assert r.status_code == 200
        assert r.json()["ok"] is True
