import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models.orm import Job, Worker, User

client = TestClient(app)


def test_finalize_job_not_found():
    resp = client.post(
        "/api/jobs/nonexistent/finalize",
        json={
            "status": "completed",
            "worker_id": "worker-01",
            "completed_files": 1,
            "failed_files": 0,
        },
    )
    assert resp.status_code == 404
