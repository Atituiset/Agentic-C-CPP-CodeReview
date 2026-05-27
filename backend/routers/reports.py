import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.database import SessionLocal
from backend.models.orm import Job, Task

router = APIRouter()


@router.get("/api/reports/{job_id}")
async def list_reports(job_id: str):
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        report_dir = None
        if job.report_dir:
            report_dir = Path(job.report_dir)
        else:
            # Fallback to tmp directory during active execution (dispatched / running)
            tmp_dir = Path("/tmp/opencode-reports") / job_id
            if tmp_dir.exists():
                report_dir = tmp_dir

        if not report_dir or not report_dir.exists():
            raise HTTPException(status_code=404, detail="Reports not found yet. The scan is still initializing or in progress.")

        # Query all tasks to find the status of each file path
        tasks = db.query(Task).filter(Task.job_id == job_id).all()
        task_status_map = {t.file_path: t.status for t in tasks}

        reports = []
        for md_file in report_dir.rglob("*.md"):
            if md_file.name == "summary.md":
                continue
            rel_path = str(md_file.relative_to(report_dir).with_suffix(""))
            reports.append({
                "filename": md_file.name,
                "path": str(md_file.relative_to(report_dir)),
                "size": md_file.stat().st_size,
                "type": "md",
                "status": task_status_map.get(rel_path, "done"),
            })

        for log_file in report_dir.rglob("*.log"):
            rel_path = str(log_file.relative_to(report_dir).with_suffix(""))
            reports.append({
                "filename": log_file.name,
                "path": str(log_file.relative_to(report_dir)),
                "size": log_file.stat().st_size,
                "type": "log",
                "status": task_status_map.get(rel_path, "done"),
            })

        # Sort by path for consistent ordering
        reports.sort(key=lambda r: r["path"])

        return {"job_id": job_id, "reports": reports}
    finally:
        db.close()


@router.get("/api/reports/{job_id}/{filepath:path}")
async def get_report(job_id: str, filepath: str):
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        report_dir = None
        if job.report_dir:
            report_dir = Path(job.report_dir)
        else:
            tmp_dir = Path("/tmp/opencode-reports") / job_id
            if tmp_dir.exists():
                report_dir = tmp_dir

        if not report_dir or not report_dir.exists():
            raise HTTPException(status_code=404, detail="Report directory not found")

        file_path = report_dir / filepath

        # Security: ensure file is within report_dir
        if not str(file_path.resolve()).startswith(str(report_dir.resolve())):
            raise HTTPException(status_code=403, detail="Invalid file path")

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Report not found")

        media_type = "text/plain" if file_path.suffix == ".log" else "text/markdown"
        return FileResponse(file_path, media_type=media_type)
    finally:
        db.close()
