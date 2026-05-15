import json
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.schemas import JobCreate, JobResponse
from backend.models.orm import Job, Task
from backend.redis_client import push_job_queue

router = APIRouter()

# Project root: backend/routers/jobs.py -> backend -> project root
PROJECT_ROOT = Path(__file__).parent.parent.parent


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _job_to_response(job: Job) -> JobResponse:
    """Convert Job ORM to response, handling JSON file_paths."""
    data = {
        "id": job.id,
        "repo_path": job.repo_path,
        "mode": job.mode,
        "target_commit": job.target_commit,
        "file_paths": json.loads(job.file_paths) if job.file_paths else None,
        "status": job.status,
        "total_files": job.total_files,
        "completed_files": job.completed_files,
        "failed_files": job.failed_files,
        "report_dir": job.report_dir,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "completed_at": job.completed_at,
    }
    return JobResponse.model_validate(data)


def _resolve_repo_path(repo_path: str | None) -> str:
    """Resolve relative repo paths against PROJECT_ROOT so orchestrator finds files
    regardless of backend's current working directory."""
    path = repo_path or "."
    p = Path(path)
    if p.is_absolute():
        return str(p)
    # Relative paths resolve against project root
    resolved = (PROJECT_ROOT / p).resolve()
    return str(resolved)


@router.post("/api/jobs", status_code=201)
async def create_job(payload: JobCreate, db: Session = Depends(get_db)):
    job = Job(
        repo_path=_resolve_repo_path(payload.repo_path),
        mode=payload.mode,
        target_commit=payload.target_commit,
        file_paths=json.dumps(payload.file_paths) if payload.file_paths else None,
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Push to Redis queue
    await push_job_queue(job.id)

    return _job_to_response(job)


@router.get("/api/jobs")
async def list_jobs(db: Session = Depends(get_db)):
    jobs = db.query(Job).order_by(Job.created_at.desc()).all()
    return [_job_to_response(j) for j in jobs]


@router.get("/api/jobs/{job_id}")
async def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_response(job)


@router.post("/api/jobs/{job_id}/progress")
async def update_job_progress(job_id: str, payload: dict, db: Session = Depends(get_db)):
    """Orchestrator reports per-task progress during job execution."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.completed_files = payload.get("completed_files", job.completed_files)
    job.failed_files = payload.get("failed_files", job.failed_files)
    db.commit()
    return {"ok": True, "job_id": job_id}


@router.post("/api/jobs/{job_id}/complete")
async def complete_job(job_id: str, payload: dict, db: Session = Depends(get_db)):
    """Worker reports job completion with task results."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = payload.get("status", "completed")
    job.completed_at = datetime.now(timezone.utc)
    job.completed_files = payload.get("completed_files", 0)
    job.failed_files = payload.get("failed_files", 0)

    for task_data in payload.get("tasks", []):
        task = Task(
            job_id=job_id,
            file_path=task_data.get("file_path", ""),
            worker_id=task_data.get("worker_id"),
            status=task_data.get("status", "done"),
            report_file=task_data.get("report_file"),
            log_file=task_data.get("log_file"),
        )
        db.add(task)

    db.commit()
    return {"ok": True, "job_id": job_id}
