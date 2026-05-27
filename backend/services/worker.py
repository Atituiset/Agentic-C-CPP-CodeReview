import asyncio
import json
import os
import logging
from datetime import datetime, timezone
from pathlib import Path

from backend.database import SessionLocal
from backend.models.orm import Job, Task, Vulnerability
from backend.redis_client import pop_job_queue
from backend.services.runner import run_orchestrator
from backend.services.report_parser import parse_vulnerability_report
from backend.services.scheduler import get_scheduler

logger = logging.getLogger("worker")


async def _poll_job_progress(db, job: Job, report_dir: Path, stop_event: asyncio.Event):
    """Periodically scan report directory and update job.completed_files and total_files."""
    while not stop_event.is_set():
        try:
            # Count .md report files (excluding summary.md)
            count = sum(
                1 for f in report_dir.rglob("*.md")
                if f.name != "summary.md"
            )
            if job.completed_files != count:
                job.completed_files = count
                db.commit()

            # Read total_files from orchestrator's discovery output
            total_file = report_dir / "total_files.json"
            if total_file.exists():
                try:
                    data = json.loads(total_file.read_text(encoding="utf-8"))
                    total = data.get("total_files", 0)
                    if job.total_files != total:
                        job.total_files = total
                        db.commit()
                except Exception:
                    pass
        except Exception:
            pass
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=2.0)
        except asyncio.TimeoutError:
            pass


async def process_job(job_id: str):
    db = SessionLocal()
    proc = None
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job or job.status not in ("queued", "resumed"):
            return

        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        # Register with scheduler for cancel support
        scheduler = get_scheduler()
        scheduler.set_running_job(job_id)

        # Create report directory (absolute path so orchestrator uses same dir)
        report_dir = Path("reports").resolve() / datetime.now().strftime("%Y%m%d_%H%M%S")
        report_dir.mkdir(parents=True, exist_ok=True)
        job.report_dir = str(report_dir)
        db.commit()

        # Node-level: worker discovers files independently.
        # Backend no longer passes file_paths; orchestrator handles discovery.

        # Pass resume info via environment: if this job is resumed from a previous one,
        # tell the orchestrator where to find the previous checkpoint.
        env_resume_dir = None
        if job.resumed_from_id:
            parent_job = db.query(Job).filter(Job.id == job.resumed_from_id).first()
            if parent_job and parent_job.report_dir:
                env_resume_dir = parent_job.report_dir

        stop_event = asyncio.Event()
        progress_task = asyncio.create_task(_poll_job_progress(db, job, report_dir, stop_event))

        try:
            job_file_paths = json.loads(job.file_paths) if job.file_paths else None
            proc = await run_orchestrator(
                job_id=job.id,
                repo_path=job.repo_path,
                mode=job.mode,
                target_commit=job.target_commit,
                file_paths=job_file_paths,
                report_dir=str(report_dir),
                resume_file=None,
                resume_from_dir=env_resume_dir,
            )

            # Monitor process with periodic cancel checks
            while proc.returncode is None:
                try:
                    await asyncio.wait_for(proc.wait(), timeout=2.0)
                except asyncio.TimeoutError:
                    if scheduler.is_cancel_requested():
                        logger.info(f"[process_job] Cancel requested for job {job_id}, terminating orchestrator")
                        proc.terminate()
                        try:
                            await asyncio.wait_for(proc.wait(), timeout=30)
                        except asyncio.TimeoutError:
                            proc.kill()
                            await proc.wait()
                        job.status = "interrupted"
                        job.cancelled_at = datetime.now(timezone.utc)
                        break

            if job.status != "interrupted":
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
            logger.error(f"[process_job] Job {job_id} failed: {e}", exc_info=True)
            job.status = "failed"
        finally:
            scheduler.clear_cancel()
            stop_event.set()
            try:
                await asyncio.wait_for(progress_task, timeout=5)
            except asyncio.TimeoutError:
                progress_task.cancel()

        job.completed_at = datetime.now(timezone.utc)
        db.commit()

        # Scan report directory for generated files
        scan_reports(db, job, report_dir)
        scan_vulnerabilities(db, job, report_dir)

        # Orchestrator saves checkpoint locally; backend reads it for display
        _read_local_checkpoint(db, job, report_dir)

    finally:
        db.close()


def _read_local_checkpoint(db, job: Job, report_dir: Path):
    """Read checkpoint saved by orchestrator on the worker node."""
    checkpoint_path = report_dir / "checkpoint.json"
    if checkpoint_path.exists():
        try:
            checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
            job.checkpoint_data = json.dumps(checkpoint)
            db.commit()
            return
        except Exception:
            pass

    # Fallback: derive from report files if orchestrator checkpoint missing
    completed = []
    failed = []
    for md_file in report_dir.rglob("*.md"):
        if md_file.name == "summary.md":
            continue
        relative = str(md_file.relative_to(report_dir).with_suffix(""))
        log_file = md_file.with_suffix(".log")
        if log_file.exists():
            try:
                log_content = log_file.read_text(encoding="utf-8", errors="replace")
                if "Status: failed" in log_content:
                    failed.append(relative)
                else:
                    completed.append(relative)
            except Exception:
                completed.append(relative)
        else:
            completed.append(relative)

    job.checkpoint_data = json.dumps({"completed": completed, "failed": failed})
    db.commit()


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
            worker_id=os.environ.get("WORKER_ID", "unknown"),
            status=task_status,
            report_file=str(md_file),
            log_file=str(log_file) if log_file.exists() else None,
        )
        db.add(task)

    job.completed_files = completed
    job.failed_files = failed
    db.commit()


def scan_vulnerabilities(db, job: Job, report_dir: Path):
    """Read each .md report file, parse vulnerabilities, and insert records."""
    for md_file in report_dir.rglob("*.md"):
        if md_file.name == "summary.md":
            continue
        try:
            markdown = md_file.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue

        records = parse_vulnerability_report(markdown, job_id=job.id)
        for record in records:
            vuln = Vulnerability(
                job_id=record["job_id"],
                task_id=record.get("task_id"),
                worker_id=record.get("worker_id"),
                vuln_id=record["vuln_id"],
                file_path=record["file_path"],
                line_start=record.get("line_start"),
                line_end=record.get("line_end"),
                severity=record["severity"],
                vuln_type=record["vuln_type"],
                title=record["title"],
                description=record.get("description"),
                raw_json=record.get("raw_json"),
            )
            db.add(vuln)
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
