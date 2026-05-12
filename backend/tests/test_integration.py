import pytest
import asyncio
from pathlib import Path
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_end_to_end_scan_flow():
    """Full flow: create job -> worker processes -> reports accessible."""
    from backend.main import app
    from backend.database import SessionLocal
    from backend.models.orm import Job
    from backend.services.worker import process_job

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create a job via API
        payload = {
            "repo_path": ".",
            "mode": "files",
            "file_paths": ["test_file.c"],
        }
        r = await client.post("/api/jobs", json=payload)
        assert r.status_code == 201
        job_data = r.json()
        job_id = job_data["id"]
        assert job_data["status"] == "queued"

        # 2. Verify job exists in database
        db = SessionLocal()
        job = db.query(Job).filter(Job.id == job_id).first()
        assert job is not None
        assert job.status == "queued"
        db.close()

        # 3. Mock orchestrator and process the job
        with patch(
            "backend.services.worker.run_orchestrator", new_callable=AsyncMock
        ) as mock_run:
            # Create a mock report directory with a test report
            import tempfile
            import shutil
            from datetime import datetime

            report_dir = Path("reports") / datetime.now().strftime("%Y%m%d_%H%M%S")
            report_dir.mkdir(parents=True, exist_ok=True)
            (report_dir / "test_file.md").write_text("# Test Report\n\nFound 0 issues.\n")

            mock_proc = AsyncMock()
            mock_proc.returncode = 0
            mock_proc.communicate = AsyncMock(return_value=(b"done", b""))
            mock_run.return_value = mock_proc

            await process_job(job_id)

            # 4. Verify job is completed
            db = SessionLocal()
            job = db.query(Job).filter(Job.id == job_id).first()
            assert job.status == "completed"
            assert job.report_dir is not None
            db.close()

            # 5. Reports should be accessible via API
            r = await client.get(f"/api/reports/{job_id}")
            assert r.status_code == 200
            data = r.json()
            assert data["job_id"] == job_id
            assert len(data["reports"]) == 1
            assert data["reports"][0]["filename"] == "test_file.md"

            # 6. Individual report content accessible
            r = await client.get(f"/api/reports/{job_id}/test_file.md")
            assert r.status_code == 200
            assert "Found 0 issues" in r.text

            # Cleanup
            shutil.rmtree(report_dir, ignore_errors=True)

    # Cleanup job from DB
    db = SessionLocal()
    db.query(Job).filter(Job.id == job_id).delete()
    db.commit()
    db.close()
