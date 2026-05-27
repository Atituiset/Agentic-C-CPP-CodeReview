import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.orm import Worker, Job, Task, WorkerGitStatus, WorkerScheduleConfig, User
from backend.models.schemas import (
    WorkerRegister, WorkerHeartbeat, WorkerResponse,
    WorkerGitStatusResponse, WorkerScheduleConfigResponse, WorkerScheduleConfigUpdate,
    WorkerCreate, WorkerUpdate,
)
from backend.routers.auth import get_current_user

try:
    from backend.services.deployer import deploy_worker as do_deploy
except ImportError:  # pragma: no cover
    do_deploy = None

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
        "owner_id": worker.owner_id,
        "ssh_host": worker.ssh_host,
        "ssh_port": worker.ssh_port,
        "ssh_username": worker.ssh_username,
        "deploy_status": worker.deploy_status,
        "deploy_error": worker.deploy_error,
        "repo_path": worker.repo_path,
        "scan_mode": worker.scan_mode,
        "target_commit": worker.target_commit,
        "cared_paths": json.loads(worker.cared_paths) if worker.cared_paths else None,
    }


@router.post("/api/workers/{worker_id}/register")
async def register_worker(
    worker_id: str,
    payload: WorkerRegister,
    db: Session = Depends(get_db),
):
    """Register a new worker node. Called by the Agent itself - no auth required."""
    existing = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if existing:
        existing.hostname = payload.hostname
        existing.ip_address = payload.ip_address
        existing.status = "idle"
        existing.current_job_id = None
        existing.last_heartbeat = datetime.now(timezone.utc)
        existing.capabilities = json.dumps(payload.capabilities) if payload.capabilities else None
        existing.deploy_status = "deployed"
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
        deploy_status="deployed",
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
async def list_workers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all registered workers."""
    query = db.query(Worker)
    if current_user.role == "user":
        from sqlalchemy import or_
        query = query.filter(
            or_(
                Worker.owner_id == current_user.id,
                Worker.owner_id.is_(None)
            )
        )
    workers = query.order_by(Worker.registered_at.desc()).all()
    return [WorkerResponse.model_validate(_worker_to_dict(w)) for w in workers]


@router.get("/api/workers/deploy-key")
async def get_deploy_key():
    """Return the backend's SSH deploy public key for users to add to authorized_keys."""
    from backend.services.deploy_key import get_public_key
    return {"public_key": get_public_key()}


@router.get("/api/workers/{worker_id}")
async def get_worker(
    worker_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific worker."""
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if worker.owner_id is not None and worker.owner_id != current_user.id and current_user.role not in ("admin", "committer"):
        raise HTTPException(status_code=403, detail="Not your worker")
    return WorkerResponse.model_validate(_worker_to_dict(worker))


@router.put("/api/workers/{worker_id}/show-thinking")
async def update_worker_show_thinking(
    worker_id: str,
    show_thinking: bool,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a worker's show_thinking setting."""
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if worker.owner_id != current_user.id and current_user.role not in ("admin", "committer"):
        raise HTTPException(status_code=403, detail="Not your worker")
    worker.show_thinking = show_thinking
    db.commit()
    db.refresh(worker)
    return {"show_thinking": worker.show_thinking}


# ------------------------------------------------------------------
# Node-level Git Status
# ------------------------------------------------------------------

@router.get("/api/workers/{worker_id}/git-status", response_model=WorkerGitStatusResponse)
async def get_worker_git_status(
    worker_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
async def get_worker_schedule(
    worker_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get scan schedule config for a specific worker. Auto-creates default if missing."""
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if worker.owner_id is not None and worker.owner_id != current_user.id and current_user.role not in ("admin", "committer"):
        raise HTTPException(status_code=403, detail="Not your worker")
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
    current_user: User = Depends(get_current_user),
):
    """Update scan schedule config for a specific worker."""
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if worker.owner_id != current_user.id and current_user.role not in ("admin", "committer"):
        raise HTTPException(status_code=403, detail="Not your worker")
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


# ------------------------------------------------------------------
# Create / Deploy endpoints for remote workers
# ------------------------------------------------------------------

@router.post("/api/workers")
async def create_worker(
    payload: WorkerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(Worker).filter(Worker.worker_id == payload.worker_id).first():
        raise HTTPException(status_code=409, detail="Worker ID already exists")

    worker = Worker(
        worker_id=payload.worker_id,
        hostname=payload.hostname,
        ip_address=payload.ip_address,
        owner_id=current_user.id,
        ssh_host=payload.ssh_host,
        ssh_port=payload.ssh_port,
        ssh_username=payload.ssh_username,
        ssh_key=payload.ssh_key,
        ssh_password=payload.ssh_password,
        repo_path=payload.repo_path,
        scan_mode=payload.scan_mode,
        target_commit=payload.target_commit,
        cared_paths=json.dumps(payload.cared_paths) if payload.cared_paths else None,
        deploy_status="pending",
    )
    db.add(worker)
    db.commit()
    db.refresh(worker)
    return WorkerResponse.model_validate(_worker_to_dict(worker))


@router.post("/api/workers/{worker_id}/deploy")
async def deploy_worker_endpoint(
    worker_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if worker.owner_id != current_user.id and current_user.role not in ("admin", "committer"):
        raise HTTPException(status_code=403, detail="Not your worker")

    background_tasks.add_task(do_deploy, worker_id)
    return {"ok": True, "message": "Deployment started"}


@router.get("/api/workers/deploy-key")
async def get_deploy_key():
    """Return the backend's SSH deploy public key for users to add to authorized_keys."""
    from backend.services.deploy_key import get_public_key
    return {"public_key": get_public_key()}


# ------------------------------------------------------------------
# Deploy Logs
# ------------------------------------------------------------------

@router.get("/api/workers/{worker_id}/deploy-logs")
async def get_worker_deploy_logs(
    worker_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get deployment logs for a worker."""
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if worker.owner_id != current_user.id and current_user.role not in ("admin", "committer"):
        raise HTTPException(status_code=403, detail="Not your worker")
    logs = []
    if worker.deploy_logs:
        try:
            logs = json.loads(worker.deploy_logs)
        except Exception:
            pass
    return {"logs": logs, "deploy_status": worker.deploy_status, "deploy_error": worker.deploy_error}


# ------------------------------------------------------------------
# Edit Worker
# ------------------------------------------------------------------

@router.put("/api/workers/{worker_id}")
async def update_worker(
    worker_id: str,
    payload: WorkerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update worker configuration (SSH, repo, scan settings)."""
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if worker.owner_id != current_user.id and current_user.role not in ("admin", "committer"):
        raise HTTPException(status_code=403, detail="Not your worker")

    if payload.ssh_host is not None:
        worker.ssh_host = payload.ssh_host
    if payload.ssh_port is not None:
        worker.ssh_port = payload.ssh_port
    if payload.ssh_username is not None:
        worker.ssh_username = payload.ssh_username
    if payload.ssh_password is not None:
        worker.ssh_password = payload.ssh_password
    if payload.repo_path is not None:
        worker.repo_path = payload.repo_path
    if payload.scan_mode is not None:
        worker.scan_mode = payload.scan_mode
    if payload.target_commit is not None:
        worker.target_commit = payload.target_commit
    if payload.cared_paths is not None:
        worker.cared_paths = json.dumps(payload.cared_paths) if payload.cared_paths else None

    db.commit()
    db.refresh(worker)
    return WorkerResponse.model_validate(_worker_to_dict(worker))


@router.delete("/api/workers/{worker_id}")
async def delete_worker(
    worker_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a worker and its related configuration."""
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if worker.owner_id != current_user.id and current_user.role not in ("admin", "committer"):
        raise HTTPException(status_code=403, detail="Not your worker")

    # Clean up related records
    db.query(WorkerScheduleConfig).filter(WorkerScheduleConfig.worker_id == worker_id).delete()
    db.query(WorkerGitStatus).filter(WorkerGitStatus.worker_id == worker_id).delete()
    db.delete(worker)
    db.commit()
    return {"ok": True, "message": f"Worker {worker_id} deleted"}
