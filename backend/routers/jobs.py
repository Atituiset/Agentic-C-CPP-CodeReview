import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.schemas import JobCreate, JobResponse, JobResumeRequest, GitSyncResponse, SchedulerStatusResponse, JobFinalizePayload
from backend.models.orm import Job, Task, Vulnerability
from backend.redis_client import push_job_queue
from backend.services.git_sync import get_all_cpp_files, get_head_commit, get_changes_since
from backend.services.scheduler import get_scheduler
from backend.services.report_parser import parse_vulnerability_report

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
        "worker_id": job.assigned_worker_id,
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
    repo_path = _resolve_repo_path(payload.repo_path)
    file_paths = payload.file_paths
    target_commit = payload.target_commit
    base_commit = None
    scan_stats = None

    if payload.mode == "full":
        # Full scan: worker node discovers files independently
        # Backend only records git stats for dashboard display
        current_commit = get_head_commit(repo_path)
        base_commit = current_commit

        # Get incremental changes since last full scan
        last_job = (
            db.query(Job)
            .filter(Job.mode == "full", Job.repo_path == repo_path)
            .order_by(Job.created_at.desc())
            .first()
        )
        prev_commit = last_job.base_commit if last_job else None
        git_stats = get_changes_since(repo_path, prev_commit)
        scan_stats = {
            "total_files": 0,
            "added_files": git_stats["added_files"],
            "modified_files": git_stats["modified_files"],
            "deleted_files": git_stats["deleted_files"],
            "changed_lines": git_stats["changed_lines"],
        }

    job = Job(
        repo_path=repo_path,
        mode=payload.mode,
        target_commit=target_commit,
        file_paths=json.dumps(file_paths) if file_paths else None,
        status="queued",
        total_files=len(file_paths) if file_paths else 0,
        base_commit=base_commit,
        scan_stats=json.dumps(scan_stats) if scan_stats else None,
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
    job.total_files = payload.get("total_files", job.total_files)
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


@router.post("/api/jobs/{job_id}/finalize")
async def finalize_job(
    job_id: str,
    payload: JobFinalizePayload,
    db: Session = Depends(get_db),
):
    """Agent scan completion callback. Bulk-creates Task and Vulnerability records."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = payload.status
    job.completed_at = datetime.now(timezone.utc)
    job.completed_files = payload.completed_files
    job.failed_files = payload.failed_files

    # Create local report directory and write report contents from agent
    from pathlib import Path
    report_dir = Path("reports").resolve() / job_id
    report_dir.mkdir(parents=True, exist_ok=True)
    job.report_dir = str(report_dir)

    # Bulk create Tasks and write report files locally
    for task_data in (payload.tasks or []):
        rel_path = task_data.get("file_path", "")
        task_id = str(uuid.uuid4())
        task = Task(
            id=task_id,
            job_id=job_id,
            worker_id=payload.worker_id,
            file_path=rel_path,
            status=task_data.get("status", "done"),
            report_file=task_data.get("report_file"),
            log_file=task_data.get("log_file"),
        )
        db.add(task)

        # Write report content to local filesystem for ReportViewer
        if task_data.get("report_content"):
            md_path = report_dir / f"{rel_path}.md"
            md_path.parent.mkdir(parents=True, exist_ok=True)
            md_path.write_text(task_data["report_content"], encoding="utf-8")

            # Centralized parsing on backend!
            try:
                records = parse_vulnerability_report(
                    task_data["report_content"],
                    job_id=job_id,
                    task_id=task_id,
                    worker_id=payload.worker_id,
                )
                for vuln_data in records:
                    vuln = Vulnerability(
                        job_id=job_id,
                        task_id=task_id,
                        worker_id=payload.worker_id,
                        vuln_id=vuln_data.get("vuln_id", "VULN-UNKNOWN"),
                        file_path=vuln_data.get("file_path") or rel_path,
                        line_start=vuln_data.get("line_start"),
                        line_end=vuln_data.get("line_end"),
                        severity=vuln_data.get("severity", "Medium"),
                        vuln_type=vuln_data.get("vuln_type", "nga_semantic"),
                        title=vuln_data.get("title", "Unknown vulnerability"),
                        description=vuln_data.get("description"),
                        raw_json=vuln_data.get("raw_json"),
                    )
                    db.add(vuln)
            except Exception as e:
                import logging
                logging.getLogger("jobs").error(f"Failed to parse vulnerabilities from {rel_path}: {e}")

        if task_data.get("log_content"):
            log_path = report_dir / f"{rel_path}.log"
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log_path.write_text(task_data["log_content"], encoding="utf-8")

    # Bulk create Vulnerabilities (from payload if any)
    for vuln_data in (payload.vulnerabilities or []):
        vuln = Vulnerability(
            job_id=job_id,
            task_id=vuln_data.get("task_id"),
            worker_id=payload.worker_id,
            vuln_id=vuln_data.get("vuln_id", "VULN-UNKNOWN"),
            file_path=vuln_data.get("file_path", ""),
            line_start=vuln_data.get("line_start"),
            line_end=vuln_data.get("line_end"),
            severity=vuln_data.get("severity", "Medium"),
            vuln_type=vuln_data.get("vuln_type", "unknown"),
            title=vuln_data.get("title", "Unknown vulnerability"),
            description=vuln_data.get("description"),
            raw_json=vuln_data.get("raw_json"),
        )
        db.add(vuln)

    db.commit()
    return {"ok": True, "job_id": job_id, "status": payload.status}


@router.post("/api/jobs/{job_id}/resume")
async def resume_job(job_id: str, db: Session = Depends(get_db)):
    """Resume an interrupted job from its checkpoint."""
    original_job = db.query(Job).filter(Job.id == job_id).first()
    if not original_job:
        raise HTTPException(status_code=404, detail="Job not found")

    if original_job.status not in ("interrupted", "failed"):
        raise HTTPException(status_code=400, detail="Only interrupted or failed jobs can be resumed")

    if not original_job.checkpoint_data:
        raise HTTPException(status_code=400, detail="No checkpoint data available for this job")

    # Create a new job that resumes from the original
    new_job = Job(
        repo_path=original_job.repo_path,
        mode=original_job.mode,
        file_paths=original_job.file_paths,
        status="queued",
        total_files=original_job.total_files,
        base_commit=original_job.base_commit,
        scan_stats=original_job.scan_stats,
        resumed_from_id=original_job.id,
    )
    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    # Push to Redis queue
    await push_job_queue(new_job.id)

    return {"ok": True, "job_id": new_job.id, "resumed_from": job_id}


@router.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, db: Session = Depends(get_db)):
    """Cancel a running or queued job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status == "running":
        scheduler = get_scheduler()
        scheduler.request_cancel(job_id)
        job.status = "interrupted"
        job.cancelled_at = datetime.now(timezone.utc)
        db.commit()
        return {"ok": True, "job_id": job_id, "status": "interrupted"}

    elif job.status == "queued":
        job.status = "cancelled"
        db.commit()
        return {"ok": True, "job_id": job_id, "status": "cancelled"}

    else:
        raise HTTPException(status_code=400, detail=f"Cannot cancel job with status '{job.status}'")


@router.get("/api/jobs/stats/git-sync", response_model=GitSyncResponse)
async def git_sync_stats(db: Session = Depends(get_db)):
    """Get git changes since the last full scan."""
    repo_path = "."
    current_commit = get_head_commit(repo_path)

    last_job = (
        db.query(Job)
        .filter(Job.mode == "full")
        .order_by(Job.created_at.desc())
        .first()
    )
    base_commit = last_job.base_commit if last_job else None

    git_stats = get_changes_since(repo_path, base_commit)
    total_cpp = len(get_all_cpp_files(repo_path))

    return GitSyncResponse(
        base_commit=base_commit,
        current_commit=current_commit or "",
        added_files=git_stats["added_files"],
        modified_files=git_stats["modified_files"],
        deleted_files=git_stats["deleted_files"],
        changed_lines=git_stats["changed_lines"],
        total_cpp_files=total_cpp,
    )


@router.get("/api/jobs/scheduler/status", response_model=SchedulerStatusResponse)
async def scheduler_status(worker_id: str = ""):
    """Get the scan scheduler status. Pass worker_id for per-worker status."""
    scheduler = get_scheduler()
    status = scheduler.get_status(worker_id if worker_id else None)
    return SchedulerStatusResponse(**status)
