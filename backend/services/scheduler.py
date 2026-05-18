import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.orm import Job, SchedulerConfig, WorkerScheduleConfig
from backend.redis_client import push_job_queue
from backend.services.git_sync import get_changes_since, get_head_commit

logger = logging.getLogger("Scheduler")


class ScanScheduler:
    """Per-worker APScheduler-based daily scan scheduler.

    Each worker node can have its own scan/stop schedule configured by the user.
    """

    def __init__(self):
        self.scheduler: Optional[AsyncIOScheduler] = None
        self._cancel_event = asyncio.Event()
        self._running_job_id: Optional[str] = None

    async def start(self):
        """Start the scheduler and register per-worker cron jobs."""
        self.scheduler = AsyncIOScheduler()
        self.scheduler.start()

        # Load all worker schedules from DB and create jobs for each
        db = SessionLocal()
        try:
            configs = db.query(WorkerScheduleConfig).filter(WorkerScheduleConfig.is_enabled == True).all()
            for config in configs:
                self._add_worker_jobs(config.worker_id, config.scan_hour, config.scan_minute,
                                      config.stop_hour, config.stop_minute)
                logger.info(f"[Scheduler] Loaded schedule for worker {config.worker_id}: "
                           f"scan={config.scan_hour:02d}:{config.scan_minute:02d}, "
                           f"stop={config.stop_hour:02d}:{config.stop_minute:02d}")
        except Exception as e:
            logger.error(f"[Scheduler] Failed to load worker schedules: {e}")
        finally:
            db.close()

        logger.info("ScanScheduler started with per-worker schedules")

    def _add_worker_jobs(self, worker_id: str, scan_h: int, scan_m: int, stop_h: int, stop_m: int):
        """Add scan and stop cron jobs for a specific worker."""
        if not self.scheduler:
            return

        scan_job_id = f"{worker_id}_scan"
        stop_job_id = f"{worker_id}_stop"

        self.scheduler.add_job(
            _run_worker_scan,
            trigger=CronTrigger(hour=scan_h, minute=scan_m),
            id=scan_job_id,
            name=f"Scan for {worker_id}",
            replace_existing=True,
            args=[worker_id],
        )
        self.scheduler.add_job(
            _run_worker_stop,
            trigger=CronTrigger(hour=stop_h, minute=stop_m),
            id=stop_job_id,
            name=f"Stop for {worker_id}",
            replace_existing=True,
            args=[worker_id],
        )

    def _remove_worker_jobs(self, worker_id: str):
        """Remove scan and stop jobs for a specific worker."""
        if not self.scheduler:
            return
        for suffix in ("_scan", "_stop"):
            job_id = f"{worker_id}{suffix}"
            try:
                self.scheduler.remove_job(job_id)
            except Exception:
                pass

    async def reload_worker_schedule(self, worker_id: str):
        """Reload cron jobs for a worker after schedule config changes."""
        if not self.scheduler:
            return

        db = SessionLocal()
        try:
            config = db.query(WorkerScheduleConfig).filter(WorkerScheduleConfig.worker_id == worker_id).first()
            if not config:
                self._remove_worker_jobs(worker_id)
                logger.info(f"[Scheduler] Removed jobs for worker {worker_id} (no config)")
                return

            self._remove_worker_jobs(worker_id)
            if config.is_enabled:
                self._add_worker_jobs(worker_id, config.scan_hour, config.scan_minute,
                                      config.stop_hour, config.stop_minute)
                logger.info(f"[Scheduler] Reloaded schedule for worker {worker_id}")
            else:
                logger.info(f"[Scheduler] Disabled schedule for worker {worker_id}")
        except Exception as e:
            logger.error(f"[Scheduler] Failed to reload schedule for {worker_id}: {e}")
        finally:
            db.close()

    async def shutdown(self):
        """Shutdown the scheduler."""
        if self.scheduler:
            self.scheduler.shutdown(wait=False)
            self.scheduler = None
            logger.info("ScanScheduler shutdown")

    def request_cancel(self, job_id: str) -> bool:
        """Request cancellation of a running job. Called by daily_stop or API."""
        if self._running_job_id == job_id:
            self._cancel_event.set()
            return True
        return False

    def clear_cancel(self):
        """Clear the cancel event after job finishes."""
        self._cancel_event.clear()
        self._running_job_id = None

    def is_cancel_requested(self) -> bool:
        return self._cancel_event.is_set()

    def set_running_job(self, job_id: str):
        self._running_job_id = job_id
        self._cancel_event.clear()

    def get_status(self, worker_id: Optional[str] = None) -> dict:
        """Return scheduler status for API.

        If worker_id is provided, returns per-worker status.
        Otherwise returns the first available worker's status as default.
        """
        if not self.scheduler:
            return {
                "is_enabled": False,
                "next_scan_time": None,
                "next_stop_time": None,
                "last_scan_time": None,
                "last_stop_time": None,
                "is_running": self._running_job_id is not None,
            }

        db = SessionLocal()
        try:
            if worker_id:
                scan_job = self.scheduler.get_job(f"{worker_id}_scan")
                stop_job = self.scheduler.get_job(f"{worker_id}_stop")
                config = db.query(WorkerScheduleConfig).filter(WorkerScheduleConfig.worker_id == worker_id).first()
                return {
                    "is_enabled": config.is_enabled if config else False,
                    "next_scan_time": scan_job.next_run_time.isoformat() if scan_job and scan_job.next_run_time else None,
                    "next_stop_time": stop_job.next_run_time.isoformat() if stop_job and stop_job.next_run_time else None,
                    "scan_hour": config.scan_hour if config else 0,
                    "scan_minute": config.scan_minute if config else 0,
                    "stop_hour": config.stop_hour if config else 9,
                    "stop_minute": config.stop_minute if config else 0,
                    "timezone": config.timezone if config else "Asia/Shanghai",
                    "is_running": self._running_job_id is not None,
                }

            # Default: return status for the first enabled worker schedule
            config = db.query(WorkerScheduleConfig).filter(WorkerScheduleConfig.is_enabled == True).first()
            if config:
                return self.get_status(config.worker_id)

            return {
                "is_enabled": False,
                "next_scan_time": None,
                "next_stop_time": None,
                "is_running": self._running_job_id is not None,
            }
        finally:
            db.close()


async def _run_worker_scan(worker_id: str):
    """Triggered per-worker. Create a full-scan job assigned to this worker."""
    logger.info(f"[worker_scan] Triggered for {worker_id}")
    db = SessionLocal()
    try:
        repo_path = "."
        current_commit = get_head_commit(repo_path)

        last_job = (
            db.query(Job)
            .filter(Job.mode == "full", Job.repo_path == repo_path)
            .order_by(Job.created_at.desc())
            .first()
        )
        base_commit = last_job.base_commit if last_job else None
        git_stats = get_changes_since(repo_path, base_commit)

        job = Job(
            repo_path=repo_path,
            mode="full",
            status="queued",
            base_commit=current_commit,
            scan_stats=json.dumps({
                "total_files": 0,
                "added_files": git_stats["added_files"],
                "modified_files": git_stats["modified_files"],
                "deleted_files": git_stats["deleted_files"],
                "changed_lines": git_stats["changed_lines"],
            }),
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        await push_job_queue(job.id)
        logger.info(f"[worker_scan] Created job {job.id} for worker {worker_id}")

        # Update legacy scheduler config record
        config = db.query(SchedulerConfig).filter(SchedulerConfig.job_name == "daily_scan").first()
        if not config:
            config = SchedulerConfig(job_name="daily_scan", job_type="scan", cron_expression="0 0 * * *")
            db.add(config)
        config.last_run_at = datetime.now(timezone.utc)
        db.commit()

    except Exception as e:
        logger.error(f"[worker_scan] Failed for {worker_id}: {e}")
    finally:
        db.close()


async def _run_worker_stop(worker_id: str):
    """Triggered per-worker. Cancel running jobs for this worker."""
    logger.info(f"[worker_stop] Triggered for {worker_id}")
    db = SessionLocal()
    try:
        running_job = db.query(Job).filter(Job.status == "running").order_by(Job.started_at.desc()).first()
        if running_job:
            logger.info(f"[worker_stop] Cancelling job {running_job.id}")
            scheduler = get_scheduler()
            scheduler.request_cancel(running_job.id)
            running_job.status = "interrupted"
            running_job.cancelled_at = datetime.now(timezone.utc)
            db.commit()
        else:
            logger.info(f"[worker_stop] No running jobs for {worker_id}")

        config = db.query(SchedulerConfig).filter(SchedulerConfig.job_name == "daily_stop").first()
        if not config:
            config = SchedulerConfig(job_name="daily_stop", job_type="stop", cron_expression="0 9 * * *")
            db.add(config)
        config.last_run_at = datetime.now(timezone.utc)
        db.commit()

    except Exception as e:
        logger.error(f"[worker_stop] Failed for {worker_id}: {e}")
    finally:
        db.close()


# Global singleton
_scan_scheduler: Optional[ScanScheduler] = None


def get_scheduler() -> ScanScheduler:
    global _scan_scheduler
    if _scan_scheduler is None:
        _scan_scheduler = ScanScheduler()
    return _scan_scheduler
