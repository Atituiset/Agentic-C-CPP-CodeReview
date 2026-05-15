import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.orm import Worker, Job, Task
from backend.models.schemas import WorkerRegister, WorkerHeartbeat, WorkerResponse

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
    return {"ok": True, "message": "Worker registered", "worker": WorkerResponse.model_validate(_worker_to_dict(worker))}


@router.post("/api/workers/{worker_id}/heartbeat")
async def worker_heartbeat(worker_id: str, payload: WorkerHeartbeat, db: Session = Depends(get_db)):
    """Worker heartbeat. Updates status and last_heartbeat."""
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found, please register first")

    worker.status = payload.status
    worker.current_job_id = payload.current_job_id
    worker.last_heartbeat = datetime.now(timezone.utc)
    db.commit()
    db.refresh(worker)
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
