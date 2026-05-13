import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from backend.database import SessionLocal
from backend.models.orm import Job, Task
from backend.redis_client import pop_job_queue
from backend.services.runner import run_orchestrator


async def process_job(job_id: str):
    db = SessionLocal()
    proc = None
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job or job.status != "queued":
            return

        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        # Create report directory (absolute path so orchestrator uses same dir)
        report_dir = Path("reports").resolve() / datetime.now().strftime("%Y%m%d_%H%M%S")
        report_dir.mkdir(parents=True, exist_ok=True)
        job.report_dir = str(report_dir)
        db.commit()

        file_paths = json.loads(job.file_paths) if job.file_paths else None
        if file_paths:
            job.total_files = len(file_paths)
            db.commit()

        try:
            proc = await run_orchestrator(
                job_id=job.id,
                repo_path=job.repo_path,
                mode=job.mode,
                target_commit=job.target_commit,
                file_paths=file_paths,
                report_dir=str(report_dir),
            )

            stdout, stderr = await proc.communicate()

            if proc.returncode == 0:
                job.status = "completed"
            else:
                job.status = "failed"

        except asyncio.CancelledError:
            # Graceful shutdown: terminate orchestrator
            if proc is not None and proc.returncode is None:
                proc.terminate()
                try:
                    await asyncio.wait_for(proc.wait(), timeout=10)
                except asyncio.TimeoutError:
                    proc.kill()
            job.status = "failed"
            db.commit()
            raise
        except Exception as e:
            job.status = "failed"

        job.completed_at = datetime.now(timezone.utc)
        db.commit()

        # Scan report directory for generated files
        scan_reports(db, job, report_dir)

    finally:
        db.close()


def scan_reports(db, job: Job, report_dir: Path):
    """Scan report directory and create Task records, updating job counters."""
    completed = 0
    failed = 0
    for md_file in report_dir.rglob("*.md"):
        if md_file.name == "summary.md":
            continue
        relative = md_file.relative_to(report_dir)
        log_file = md_file.with_suffix(".log")

        task_status = "done"
        if log_file.exists():
            try:
                log_content = log_file.read_text(encoding="utf-8", errors="replace")
                if "Status: failed" in log_content:
                    task_status = "failed"
            except Exception:
                pass

        if task_status == "done":
            completed += 1
        else:
            failed += 1

        task = Task(
            job_id=job.id,
            file_path=str(relative.with_suffix("")),
            status=task_status,
            report_file=str(md_file),
            log_file=str(log_file) if log_file.exists() else None,
        )
        db.add(task)

    job.completed_files = completed
    job.failed_files = failed
    db.commit()


async def worker_loop():
    """Background loop: consume jobs from Redis queue."""
    while True:
        try:
            job_id = await pop_job_queue(timeout=5)
            if job_id:
                await process_job(job_id)
            else:
                await asyncio.sleep(1)
        except Exception as e:
            await asyncio.sleep(5)
