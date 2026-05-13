import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.schemas import JobCreate, JobResponse
from backend.models.orm import Job
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
