import pytest
from httpx import AsyncClient, ASGITransport
from pathlib import Path


@pytest.mark.asyncio
async def test_list_reports_for_missing_job():
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/reports/nonexistent-job")
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_list_reports_for_job_with_reports():
    from backend.main import app
    from backend.database import SessionLocal
    from backend.models.orm import Job

    # Create a job with a report directory
    db = SessionLocal()
    job = Job(
        id="test-reports-job",
        repo_path=".",
        mode="files",
        status="completed",
        report_dir="reports/test_reports_20250101_120000",
    )
    db.add(job)
    db.commit()
    db.close()

    # Create mock report files
    report_dir = Path("reports/test_reports_20250101_120000")
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "test.md").write_text("# Test Report")
    (report_dir / "summary.md").write_text("# Summary")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/reports/test-reports-job")
        assert r.status_code == 200
        data = r.json()
        assert data["job_id"] == "test-reports-job"
        assert len(data["reports"]) == 1
        assert data["reports"][0]["filename"] == "test.md"

    # Cleanup
    import shutil
    shutil.rmtree(report_dir, ignore_errors=True)
    db = SessionLocal()
    db.query(Job).filter(Job.id == "test-reports-job").delete()
    db.commit()
    db.close()
