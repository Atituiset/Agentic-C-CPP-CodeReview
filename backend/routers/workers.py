import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.orm import Worker, Job, Task, WorkerGitStatus, WorkerScheduleConfig
from backend.models.schemas import (
    WorkerRegister, WorkerHeartbeat, WorkerResponse,
    WorkerGitStatusResponse, WorkerScheduleConfigResponse, WorkerScheduleConfigUpdate,
)

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _worker_to_dict(worker: Worker) -> dict:
    """Convert Worker ORM to dict, parsing JSON capabilities."""
    return {
        "id": worker.id,
        "worker_id": worker.worker_id,
        "hostname": worker.hostname,
        "ip_address": worker.ip_address,
        "status": worker.status,
        "current_job_id": worker.current_job_id,
        "last_heartbeat": worker.last_heartbeat,
        "registered_at": worker.registered_at,
        "capabilities": json.loads(worker.capabilities) if worker.capabilities else None,
        "show_thinking": worker.show_thinking,
    }


@router.post("/api/workers/{worker_id}/register")
async def register_worker(worker_id: str, payload: WorkerRegister, db: Session = Depends(get_db)):
    """Register a new worker node."""
    existing = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if existing:
        existing.hostname = payload.hostname
        existing.ip_address = payload.ip_address
        existing.status = "idle"
        existing.current_job_id = None
        existing.last_heartbeat = datetime.now(timezone.utc)
        existing.capabilities = json.dumps(payload.capabilities) if payload.capabilities else None
        db.commit()
        db.refresh(existing)
        return {"ok": True, "message": "Worker updated", "worker": WorkerResponse.model_validate(_worker_to_dict(existing))}

    worker = Worker(
        worker_id=worker_id,
        hostname=payload.hostname,
        ip_address=payload.ip_address,
        status="idle",
        last_heartbeat=datetime.now(timezone.utc),
        capabilities=json.dumps(payload.capabilities) if payload.capabilities else None,
    )
    db.add(worker)
    db.commit()
    db.refresh(worker)

    # Create default schedule config for this worker
    schedule = db.query(WorkerScheduleConfig).filter(WorkerScheduleConfig.worker_id == worker_id).first()
    if not schedule:
        schedule = WorkerScheduleConfig(worker_id=worker_id)
        db.add(schedule)
        db.commit()

    # Create default git status record
    git_status = db.query(WorkerGitStatus).filter(WorkerGitStatus.worker_id == worker_id).first()
    if not git_status:
        git_status = WorkerGitStatus(worker_id=worker_id)
        db.add(git_status)
        db.commit()

    return {"ok": True, "message": "Worker registered", "worker": WorkerResponse.model_validate(_worker_to_dict(worker))}


@router.post("/api/workers/{worker_id}/heartbeat")
async def worker_heartbeat(worker_id: str, payload: WorkerHeartbeat, db: Session = Depends(get_db)):
    """Worker heartbeat. Updates status, last_heartbeat, and optionally git stats."""
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found, please register first")

    worker.status = payload.status
    worker.current_job_id = payload.current_job_id
    worker.last_heartbeat = datetime.now(timezone.utc)
    db.commit()
    db.refresh(worker)

    # Update node-level git stats if provided
    if payload.head_commit is not None:
        git_status = db.query(WorkerGitStatus).filter(WorkerGitStatus.worker_id == worker_id).first()
        if not git_status:
            git_status = WorkerGitStatus(worker_id=worker_id)
            db.add(git_status)
        git_status.head_commit = payload.head_commit
        git_status.added_files = payload.added_files
        git_status.modified_files = payload.modified_files
        git_status.deleted_files = payload.deleted_files
        git_status.changed_lines = payload.changed_lines
        git_status.total_cpp_files = payload.total_cpp_files
        db.commit()

    return {"ok": True, "worker": WorkerResponse.model_validate(_worker_to_dict(worker))}


@router.get("/api/workers")
async def list_workers(db: Session = Depends(get_db)):
    """List all registered workers."""
    workers = db.query(Worker).order_by(Worker.registered_at.desc()).all()
    return [WorkerResponse.model_validate(_worker_to_dict(w)) for w in workers]


@router.get("/api/workers/{worker_id}")
async def get_worker(worker_id: str, db: Session = Depends(get_db)):
    """Get a specific worker."""
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    return WorkerResponse.model_validate(_worker_to_dict(worker))


@router.put("/api/workers/{worker_id}/show-thinking")
async def update_worker_show_thinking(
    worker_id: str,
    show_thinking: bool,
    db: Session = Depends(get_db),
):
    """Update a worker's show_thinking setting."""
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    worker.show_thinking = show_thinking
    db.commit()
    db.refresh(worker)
    return {"show_thinking": worker.show_thinking}


# ------------------------------------------------------------------
# Node-level Git Status
# ------------------------------------------------------------------

@router.get("/api/workers/{worker_id}/git-status", response_model=WorkerGitStatusResponse)
async def get_worker_git_status(worker_id: str, db: Session = Depends(get_db)):
    """Get node-level git status for a specific worker. Auto-creates default if missing."""
    git_status = db.query(WorkerGitStatus).filter(WorkerGitStatus.worker_id == worker_id).first()
    if not git_status:
        git_status = WorkerGitStatus(worker_id=worker_id)
        db.add(git_status)
        db.commit()
        db.refresh(git_status)
    return WorkerGitStatusResponse(
        worker_id=git_status.worker_id,
        head_commit=git_status.head_commit,
        added_files=git_status.added_files,
        modified_files=git_status.modified_files,
        deleted_files=git_status.deleted_files,
        changed_lines=git_status.changed_lines,
        total_cpp_files=git_status.total_cpp_files,
        updated_at=git_status.updated_at,
    )


@router.get("/api/workers/git-status/all")
async def get_all_workers_git_status(db: Session = Depends(get_db)):
    """Get git status for all workers."""
    statuses = db.query(WorkerGitStatus).order_by(WorkerGitStatus.updated_at.desc()).all()
    return [
        WorkerGitStatusResponse(
            worker_id=s.worker_id,
            head_commit=s.head_commit,
            added_files=s.added_files,
            modified_files=s.modified_files,
            deleted_files=s.deleted_files,
            changed_lines=s.changed_lines,
            total_cpp_files=s.total_cpp_files,
            updated_at=s.updated_at,
        )
        for s in statuses
    ]


# ------------------------------------------------------------------
# Per-Worker Schedule Configuration
# ------------------------------------------------------------------

@router.get("/api/workers/{worker_id}/schedule", response_model=WorkerScheduleConfigResponse)
async def get_worker_schedule(worker_id: str, db: Session = Depends(get_db)):
    """Get scan schedule config for a specific worker. Auto-creates default if missing."""
    schedule = db.query(WorkerScheduleConfig).filter(WorkerScheduleConfig.worker_id == worker_id).first()
    if not schedule:
        schedule = WorkerScheduleConfig(worker_id=worker_id)
        db.add(schedule)
        db.commit()
        db.refresh(schedule)
    return WorkerScheduleConfigResponse(
        worker_id=schedule.worker_id,
        scan_hour=schedule.scan_hour,
        scan_minute=schedule.scan_minute,
        stop_hour=schedule.stop_hour,
        stop_minute=schedule.stop_minute,
        is_enabled=schedule.is_enabled,
        timezone=schedule.timezone,
    )


@router.put("/api/workers/{worker_id}/schedule")
async def update_worker_schedule(
    worker_id: str,
    payload: WorkerScheduleConfigUpdate,
    db: Session = Depends(get_db),
):
    """Update scan schedule config for a specific worker."""
    schedule = db.query(WorkerScheduleConfig).filter(WorkerScheduleConfig.worker_id == worker_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule config not found for worker")

    if payload.scan_hour is not None:
        schedule.scan_hour = max(0, min(23, payload.scan_hour))
    if payload.scan_minute is not None:
        schedule.scan_minute = max(0, min(59, payload.scan_minute))
    if payload.stop_hour is not None:
        schedule.stop_hour = max(0, min(23, payload.stop_hour))
    if payload.stop_minute is not None:
        schedule.stop_minute = max(0, min(59, payload.stop_minute))
    if payload.is_enabled is not None:
        schedule.is_enabled = payload.is_enabled
    if payload.timezone is not None:
        schedule.timezone = payload.timezone

    db.commit()
    db.refresh(schedule)

    # Notify scheduler to reload this worker's jobs
    from backend.services.scheduler import get_scheduler
    scheduler = get_scheduler()
    await scheduler.reload_worker_schedule(worker_id)

    return WorkerScheduleConfigResponse(
        worker_id=schedule.worker_id,
        scan_hour=schedule.scan_hour,
        scan_minute=schedule.scan_minute,
        stop_hour=schedule.stop_hour,
        stop_minute=schedule.stop_minute,
        is_enabled=schedule.is_enabled,
        timezone=schedule.timezone,
    )
