import pytest
import asyncio
from unittest.mock import patch, AsyncMock


@pytest.mark.asyncio
async def test_worker_processes_job():
    from backend.services.worker import process_job
    from backend.database import SessionLocal
    from backend.models.orm import Job

    db = SessionLocal()
    job = Job(
        id="test-worker-job", repo_path=".", mode="files", status="queued"
    )
    db.add(job)
    db.commit()

    with patch(
        "backend.services.worker.run_orchestrator", new_callable=AsyncMock
    ) as mock_run:
        mock_proc = AsyncMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(b"", b""))
        mock_run.return_value = mock_proc

        await process_job("test-worker-job")

        mock_run.assert_called_once()
        db.refresh(job)
        assert job.status in ("completed", "failed")

    db.query(Job).filter(Job.id == "test-worker-job").delete()
    db.commit()
    db.close()
