import pytest
from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_create_job():
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post(
            "/api/jobs",
            json={"repo_path": ".", "mode": "files", "file_paths": ["test.c"]},
        )
        assert r.status_code == 201
        data = r.json()
        assert "id" in data
        assert data["status"] == "queued"


@pytest.mark.asyncio
async def test_list_jobs():
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/jobs")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
