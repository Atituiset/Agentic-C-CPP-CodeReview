import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.database import SessionLocal
from backend.models.orm import Job

router = APIRouter()


@router.get("/api/reports/{job_id}")
async def list_reports(job_id: str):
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job or not job.report_dir:
            raise HTTPException(status_code=404, detail="Job or reports not found")

        report_dir = Path(job.report_dir)
        if not report_dir.exists():
            raise HTTPException(status_code=404, detail="Report directory not found")

        reports = []
        for md_file in report_dir.rglob("*.md"):
            if md_file.name == "summary.md":
                continue
            reports.append({
                "filename": md_file.name,
                "path": str(md_file.relative_to(report_dir)),
                "size": md_file.stat().st_size,
            })

        return {"job_id": job_id, "reports": reports}
    finally:
        db.close()


@router.get("/api/reports/{job_id}/{filename}")
async def get_report(job_id: str, filename: str):
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job or not job.report_dir:
            raise HTTPException(status_code=404, detail="Job not found")

        report_dir = Path(job.report_dir)
        file_path = report_dir / filename

        # Security: ensure file is within report_dir
        if not str(file_path.resolve()).startswith(str(report_dir.resolve())):
            raise HTTPException(status_code=403, detail="Invalid file path")

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Report not found")

        return FileResponse(file_path, media_type="text/markdown")
    finally:
        db.close()
