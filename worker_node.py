#!/usr/bin/env python3
"""
Standalone Worker Node for Agentic CodeReview Platform

Deploy to any machine, run with a single command:
    python worker_node.py --backend http://platform:8000 --redis redis://platform:6379

Features:
- Auto-register to platform on startup
- Heartbeat every 5 seconds
- Compete for jobs via Redis BRPOP
- Execute orchestrator.py with WORKER_ID
- Report results back to platform via API
"""

import argparse
import asyncio
import json
import os
import platform as sys_platform
import signal
import socket
import subprocess
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    import httpx
except ImportError:
    print("ERROR: httpx is required. Install with: pip install httpx")
    sys.exit(1)

try:
    import redis.asyncio as aioredis
except ImportError:
    print("ERROR: redis is required. Install with: pip install redis")
    sys.exit(1)


DEFAULT_BACKEND_URL = "http://localhost:8000"
DEFAULT_REDIS_URL = "redis://localhost:6379/0"
DEFAULT_HEARTBEAT_INTERVAL = 5


def log(level: str, message: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] [{level}] {message}", flush=True)


class WorkerNode:
    def __init__(
        self,
        backend_url: str,
        redis_url: str,
        worker_id: str,
        heartbeat_interval: int = DEFAULT_HEARTBEAT_INTERVAL,
    ):
        self.backend_url = backend_url.rstrip("/")
        self.redis_url = redis_url
        self.worker_id = worker_id
        self.heartbeat_interval = heartbeat_interval
        self._shutdown = False
        self._redis: Optional[aioredis.Redis] = None
        self._http: Optional[httpx.AsyncClient] = None
        self._current_job_id: Optional[str] = None

    async def start(self):
        self._http = httpx.AsyncClient(timeout=httpx.Timeout(30.0))
        self._redis = aioredis.from_url(self.redis_url, decode_responses=True)
        await self._register()
        heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        try:
            await self._consume_loop()
        except asyncio.CancelledError:
            log("INFO", "Worker cancelled, shutting down...")
        finally:
            self._shutdown = True
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass
            await self._cleanup()

    async def _register(self):
        hostname = socket.gethostname()
        ip_address = self._get_ip_address()
        capabilities = {
            "platform": sys_platform.platform(),
            "python_version": sys.version.split()[0],
            "cpu_count": os.cpu_count(),
            "nga_installed": shutil_which("nga") is not None,
        }
        payload = {
            "hostname": hostname,
            "ip_address": ip_address,
            "capabilities": capabilities,
        }
        for attempt in range(10):
            try:
                resp = await self._http.post(
                    f"{self.backend_url}/api/workers/{self.worker_id}/register",
                    json=payload,
                )
                if resp.status_code == 200:
                    log("INFO", f"Registered as worker '{self.worker_id}'")
                    return
                else:
                    log("WARN", f"Registration failed: {resp.status_code} {resp.text[:100]}")
            except Exception as e:
                log("WARN", f"Registration attempt {attempt + 1}/10 failed: {e}")
            await asyncio.sleep(2)
        log("ERROR", "Failed to register worker after max retries")
        raise RuntimeError("Worker registration failed")

    async def _heartbeat_loop(self):
        while not self._shutdown:
            try:
                payload = {
                    "status": "running" if self._current_job_id else "idle",
                    "current_job_id": self._current_job_id,
                }
                resp = await self._http.post(
                    f"{self.backend_url}/api/workers/{self.worker_id}/heartbeat",
                    json=payload,
                )
                if resp.status_code != 200:
                    log("WARN", f"Heartbeat failed: {resp.status_code}")
            except Exception as e:
                log("WARN", f"Heartbeat error: {e}")
            await asyncio.sleep(self.heartbeat_interval)

    async def _consume_loop(self):
        log("INFO", "Waiting for jobs...")
        while not self._shutdown:
            try:
                result = await self._redis.brpop("scan:job:queue", timeout=5)
                if result:
                    job_id = result[1]
                    log("INFO", f"Got job: {job_id}")
                    await self._process_job(job_id)
                else:
                    continue
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log("ERROR", f"Consume loop error: {e}")
                await asyncio.sleep(5)

    async def _process_job(self, job_id: str):
        self._current_job_id = job_id
        try:
            resp = await self._http.get(f"{self.backend_url}/api/jobs/{job_id}")
            if resp.status_code != 200:
                log("ERROR", f"Failed to fetch job {job_id}: {resp.status_code}")
                return
            job = resp.json()
            log("INFO", f"Processing job {job_id}: mode={job['mode']}, repo={job['repo_path']}")
            report_dir = Path("reports") / datetime.now().strftime("%Y%m%d_%H%M%S")
            report_dir.mkdir(parents=True, exist_ok=True)
            proc = await self._run_orchestrator(job, str(report_dir))
            if proc is None:
                log("ERROR", f"Failed to start orchestrator for job {job_id}")
                return
            stdout, stderr = await proc.communicate()
            returncode = proc.returncode
            log("INFO", f"Orchestrator finished with code {returncode}")
            status = "completed" if returncode == 0 else "failed"
            await self._report_completion(job_id, status, report_dir)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log("ERROR", f"Job processing error: {e}\n{traceback.format_exc()}")
            await self._report_completion(job_id, "failed", None, error=str(e))
        finally:
            self._current_job_id = None

    async def _run_orchestrator(self, job: dict, report_dir: str) -> Optional[asyncio.subprocess.Process]:
        script = self._find_orchestrator()
        if not script:
            log("ERROR", "orchestrator.py not found on this machine")
            return None
        cmd = [sys.executable, script]
        mode = job.get("mode")
        target_commit = job.get("target_commit")
        repo_path = job.get("repo_path", ".")
        file_paths = job.get("file_paths")
        if mode == "diff" and target_commit:
            cmd.extend(["--diff", target_commit, "--repo", repo_path])
        elif mode == "files" and file_paths:
            cmd.extend(["--files"] + file_paths)
        else:
            log("ERROR", f"Unknown job mode: {mode}")
            return None
        cmd.extend(["--web-port", "3000", "-c", "3"])
        env = os.environ.copy()
        env["REPORT_DIR"] = report_dir
        env["REDIS_URL"] = self.redis_url
        env["WORKER_ID"] = self.worker_id
        env["JOB_ID"] = job.get("id", "")
        env["BACKEND_URL"] = self.backend_url
        model = self._detect_default_model()
        if model:
            env["OPENCODE_MODEL"] = model
        repo = Path(repo_path)
        if not repo.exists():
            log("WARN", f"Repo path does not exist: {repo_path}, using current directory")
            repo = Path.cwd()
        log("INFO", f"Starting orchestrator: {' '.join(cmd)}")
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            cwd=str(repo),
        )
        return proc

    async def _report_completion(self, job_id: str, status: str, report_dir: Optional[Path], error: Optional[str] = None):
        tasks = []
        completed = 0
        failed = 0
        if report_dir and report_dir.exists():
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
                            failed += 1
                        else:
                            completed += 1
                    except Exception:
                        completed += 1
                else:
                    completed += 1
                tasks.append({
                    "file_path": str(relative.with_suffix("")),
                    "status": task_status,
                    "report_file": str(relative),
                    "log_file": str(relative.with_suffix(".log")),
                    "worker_id": self.worker_id,
                })
        payload = {
            "status": status,
            "completed_files": completed,
            "failed_files": failed,
            "tasks": tasks,
            "worker_id": self.worker_id,
        }
        if error:
            payload["error"] = error
        try:
            resp = await self._http.post(
                f"{self.backend_url}/api/jobs/{job_id}/complete",
                json=payload,
            )
            if resp.status_code == 200:
                log("INFO", f"Job {job_id} completion reported: {status}")
            else:
                log("WARN", f"Failed to report completion: {resp.status_code} {resp.text[:100]}")
        except Exception as e:
            log("ERROR", f"Report completion error: {e}")

    async def _cleanup(self):
        if self._http:
            await self._http.aclose()
        if self._redis:
            await self._redis.aclose()
        log("INFO", "Worker node stopped")

    def _get_ip_address(self) -> str:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def _find_orchestrator(self) -> Optional[str]:
        candidates = [
            "worker/orchestrator.py",
            "./worker/orchestrator.py",
            "../worker/orchestrator.py",
        ]
        for c in candidates:
            p = Path(c)
            if p.exists():
                return str(p.resolve())
        return None

    def _detect_default_model(self) -> Optional[str]:
        try:
            result = subprocess.run(
                ["timeout", "5", "bash", "-c", 'nga run "hello" 2>&1 | head -2'],
                capture_output=True,
                text=True,
                timeout=7,
            )
            import re
            model_name = None
            for line in result.stdout.splitlines():
                match = re.search(r">\s+\w+\s+·\s+(.+)", line)
                if match:
                    model_name = match.group(1).strip().rstrip("/")
                    break
            if not model_name:
                return None
            models_result = subprocess.run(
                ["timeout", "5", "nga", "models"],
                capture_output=True,
                text=True,
                timeout=7,
            )
            for model_line in models_result.stdout.splitlines():
                if model_line.endswith(f"/{model_name}"):
                    return model_line.strip()
            auth_path = Path.home() / ".local" / "share" / "opencode" / "auth.json"
            if auth_path.exists():
                auth = json.loads(auth_path.read_text())
                for provider in auth.keys():
                    if provider.lower() in model_name.lower():
                        return f"{provider}/{model_name}"
            return model_name
        except Exception:
            pass
        return None


def shutil_which(cmd: str) -> Optional[str]:
    try:
        import shutil
        return shutil.which(cmd)
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Standalone Worker Node for Agentic CodeReview Platform",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python worker_node.py --backend http://platform:8000 --redis redis://platform:6379
  python worker_node.py --worker-id worker-001 --backend http://platform:8000
        """,
    )
    parser.add_argument("--backend", default=os.environ.get("BACKEND_URL", DEFAULT_BACKEND_URL),
                        help="Platform backend URL")
    parser.add_argument("--redis", default=os.environ.get("REDIS_URL", DEFAULT_REDIS_URL),
                        help="Redis URL")
    parser.add_argument("--worker-id", default=os.environ.get("WORKER_ID", None),
                        help="Worker ID")
    parser.add_argument("--heartbeat-interval", type=int,
                        default=int(os.environ.get("HEARTBEAT_INTERVAL", str(DEFAULT_HEARTBEAT_INTERVAL))),
                        help="Heartbeat interval in seconds")
    args = parser.parse_args()
    worker_id = args.worker_id or f"worker-{socket.gethostname()}"
    log("INFO", "=" * 60)
    log("INFO", "Agentic CodeReview - Standalone Worker Node")
    log("INFO", "=" * 60)
    log("INFO", f"Backend URL: {args.backend}")
    log("INFO", f"Redis URL:   {args.redis}")
    log("INFO", f"Worker ID:   {worker_id}")
    log("INFO", "=" * 60)
    worker = WorkerNode(
        backend_url=args.backend,
        redis_url=args.redis,
        worker_id=worker_id,
        heartbeat_interval=args.heartbeat_interval,
    )
    for sig in (signal.SIGINT, signal.SIGTERM):
        asyncio.get_event_loop().add_signal_handler(sig, lambda: setattr(worker, "_shutdown", True))
    try:
        asyncio.run(worker.start())
    except KeyboardInterrupt:
        log("INFO", "Interrupted by user")
    except Exception as e:
        log("ERROR", f"Worker crashed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
