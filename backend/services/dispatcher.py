import asyncio
import json
import logging
from datetime import datetime, timezone

import httpx

from backend.database import SessionLocal
from backend.models.orm import Job, Worker
from backend.redis_client import pop_job_queue, push_job_queue

logger = logging.getLogger("dispatcher")


async def _dispatch_to_worker(job: Job, worker: Worker) -> bool:
    """Dispatch a scan job to a remote worker's Agent via HTTP."""
    report_dir = f"/tmp/opencode-reports/{job.id}"
    agent_url = f"http://{worker.ip_address or worker.ssh_host}:8765/scan"

    # Use the worker's configured repo_path if available,
    # otherwise fall back to the job's repo_path.
    repo_path = worker.repo_path or job.repo_path or "."

    payload = {
        "job_id": job.id,
        "repo_path": repo_path,
        "mode": job.mode,
        "report_dir": report_dir,
    }
    if job.file_paths:
        try:
            payload["file_paths"] = json.loads(job.file_paths)
        except Exception:
            pass
    if job.target_commit:
        payload["target_commit"] = job.target_commit

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(agent_url, json=payload)
            if resp.status_code == 200:
                result = resp.json()
                if result.get("ok"):
                    job.status = "dispatched"
                    job.assigned_worker_id = worker.worker_id
                    job.dispatch_error = None
                    return True
                else:
                    err_msg = result.get("error", "Unknown error")
                    logger.warning(
                        f"Worker {worker.worker_id} rejected job {job.id}: {err_msg}"
                    )
                    job.dispatch_error = f"Worker rejected: {err_msg}"
                    return False
            else:
                err_msg = f"Agent returned {resp.status_code}: {resp.text}"
                logger.warning(
                    f"Worker {worker.worker_id} returned {resp.status_code}: {resp.text}"
                )
                job.dispatch_error = err_msg
                return False
    except Exception as e:
        err_msg = str(e)
        logger.error(
            f"Failed to dispatch job {job.id} to {worker.worker_id}: {e}"
        )
        job.dispatch_error = f"Dispatch failed: {err_msg}"
        return False


def _find_available_worker(db) -> Worker | None:
    """Find a deployed, online worker."""
    now = datetime.now(timezone.utc)
    workers = db.query(Worker).filter(Worker.deploy_status == "deployed").all()
    for worker in workers:
        if worker.last_heartbeat:
            heartbeat = worker.last_heartbeat
            if heartbeat.tzinfo is None:
                diff = (now.replace(tzinfo=None) - heartbeat).total_seconds()
            else:
                diff = (now - heartbeat).total_seconds()
            if diff <= 120:
                return worker
    return None


async def dispatcher_loop():
    """Background loop: consume jobs from Redis queue and dispatch to remote workers."""
    logger.info("Dispatcher loop started")
    while True:
        job_id = None
        try:
            job_id = await pop_job_queue(timeout=5)
            if not job_id:
                await asyncio.sleep(1)
                continue

            db = SessionLocal()
            try:
                job = db.query(Job).filter(Job.id == job_id).first()
                if not job or job.status not in ("queued", "resumed"):
                    continue

                worker = _find_available_worker(db)
                if not worker:
                    logger.info(f"No available worker for job {job_id}, re-queueing")
                    job.dispatch_error = "No deployed, online worker available"
                    db.commit()
                    await push_job_queue(job_id)
                    await asyncio.sleep(5)
                    continue

                dispatched = await _dispatch_to_worker(job, worker)
                db.commit()
                if dispatched:
                    logger.info(f"Job {job_id} dispatched to {worker.worker_id}")
                else:
                    await push_job_queue(job_id)
                    await asyncio.sleep(5)

            finally:
                db.close()

        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Dispatcher error: {e}", exc_info=True)
            if job_id:
                try:
                    await push_job_queue(job_id)
                except Exception:
                    pass
            await asyncio.sleep(5)
