#!/usr/bin/env python3
"""OpenCode Worker Agent -常驻 lightweight service deployed on remote scanning machines.

Capabilities:
- Registers with backend on startup
- Sends periodic heartbeats
- Receives scan commands via HTTP POST /scan
- Launches orchestrator as a subprocess
- Monitors scan completion, parses reports, uploads results via HTTP
"""

import asyncio
import json
import os
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    import httpx
except ImportError:
    print("ERROR: httpx not installed. Run: python3 -m pip install --user httpx")
    sys.exit(1)

try:
    from fastapi import FastAPI
    import uvicorn
except ImportError:
    print("ERROR: fastapi/uvicorn not installed. Run: python3 -m pip install --user fastapi uvicorn")
    sys.exit(1)

# Optional: Redis for log push
try:
    import redis.asyncio as aioredis
except ImportError:
    aioredis = None  # type: ignore

# Optional: Report parser for result upload
try:
    sys.path.insert(0, str(Path(__file__).parent))
    from backend.services.report_parser import parse_vulnerability_report
except ImportError:
    parse_vulnerability_report = None  # type: ignore

app = FastAPI()

# Load config from ~/.opencode-agent/config.json
CONFIG_PATH = Path.home() / ".opencode-agent" / "config.json"
config: dict = {}

if CONFIG_PATH.exists():
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
else:
    print(f"ERROR: Config not found at {CONFIG_PATH}")
    sys.exit(1)

WORKER_ID = config.get("worker_id", "unknown")
BACKEND_URL = config.get("backend_url", "http://localhost:8000")
REDIS_URL = config.get("redis_url", "redis://localhost:6379/0")
REPO_PATH = config.get("repo_path", ".")

# Global state
_orchestrator_proc: Optional[subprocess.Popen] = None


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


async def _register():
    """Register with backend on startup."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{BACKEND_URL}/api/workers/{WORKER_ID}/register",
                json={"hostname": socket.gethostname(), "ip_address": get_local_ip()},
            )
            if resp.status_code == 200:
                print(f"[Agent] Registered as {WORKER_ID}")
            else:
                print(f"[Agent] Register warning: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"[Agent] Register failed: {e}")


async def _heartbeat_loop():
    """Send heartbeat every 30 seconds."""
    while True:
        await asyncio.sleep(30)
        try:
            status = "running" if _is_orchestrator_running() else "idle"
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"{BACKEND_URL}/api/workers/{WORKER_ID}/heartbeat",
                    json={"status": status, "current_job_id": _get_current_job_id()},
                )
        except Exception as e:
            print(f"[Agent] Heartbeat failed: {e}")


def _is_orchestrator_running() -> bool:
    global _orchestrator_proc
    if _orchestrator_proc is None:
        return False
    return _orchestrator_proc.poll() is None


def _get_current_job_id() -> Optional[str]:
    return getattr(_monitor_task, "job_id", None) if "_monitor_task" in globals() else None


@app.post("/scan")
async def start_scan(payload: dict):
    """Receive scan command and launch orchestrator."""
    global _orchestrator_proc

    if _is_orchestrator_running():
        return {"ok": False, "error": "Another scan is already running"}

    job_id = payload.get("job_id")
    repo_path = payload.get("repo_path", REPO_PATH)
    mode = payload.get("mode", "full")
    report_dir = payload.get("report_dir", f"/tmp/opencode-reports/{job_id}")

    Path(report_dir).mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["JOB_ID"] = job_id
    env["WORKER_ID"] = WORKER_ID
    env["REDIS_URL"] = REDIS_URL
    env["BACKEND_URL"] = BACKEND_URL
    env["REPORT_DIR"] = report_dir

    # Find orchestrator.py
    orch_path = Path(__file__).parent / "orchestrator.py"
    if not orch_path.exists():
        orch_path = Path(__file__).parent.parent / "orchestrator.py"

    cmd = ["python3", str(orch_path), f"--{mode}", "--repo", repo_path, "-c", "3"]

    print(f"[Agent] Starting scan: job={job_id}, mode={mode}, repo={repo_path}")
    _orchestrator_proc = subprocess.Popen(
        cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )

    asyncio.create_task(_monitor_scan(job_id, report_dir))
    return {"ok": True, "pid": _orchestrator_proc.pid}


async def _monitor_scan(job_id: str, report_dir: str):
    """Monitor orchestrator, parse reports, upload results."""
    global _orchestrator_proc
    proc = _orchestrator_proc

    if proc is None:
        return

    while proc.poll() is None:
        await asyncio.sleep(2)

    exit_code = proc.returncode
    print(f"[Agent] Scan completed: job={job_id}, exit_code={exit_code}")

    tasks = []
    vulnerabilities = []

    report_path = Path(report_dir)
    if report_path.exists():
        for md_file in report_path.rglob("*.md"):
            if md_file.name == "summary.md":
                continue
            relative = str(md_file.relative_to(report_path).with_suffix(""))
            log_file = md_file.with_suffix(".log")

            task_status = "done"
            if log_file.exists():
                try:
                    log_content = log_file.read_text(encoding="utf-8", errors="replace")
                    if "Status: failed" in log_content:
                        task_status = "failed"
                except Exception:
                    pass

            tasks.append({
                "file_path": relative,
                "status": task_status,
                "report_file": str(md_file),
                "log_file": str(log_file) if log_file.exists() else None,
            })

            if parse_vulnerability_report:
                try:
                    markdown = md_file.read_text(encoding="utf-8", errors="replace")
                    records = parse_vulnerability_report(markdown, job_id=job_id)
                    for r in records:
                        r["worker_id"] = WORKER_ID
                        vulnerabilities.append(r)
                except Exception as e:
                    print(f"[Agent] Failed to parse {md_file}: {e}")

    status = "completed" if exit_code == 0 else "failed"
    completed = sum(1 for t in tasks if t["status"] == "done")
    failed = sum(1 for t in tasks if t["status"] == "failed")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{BACKEND_URL}/api/jobs/{job_id}/finalize",
                json={
                    "status": status,
                    "worker_id": WORKER_ID,
                    "completed_files": completed,
                    "failed_files": failed,
                    "tasks": tasks,
                    "vulnerabilities": vulnerabilities,
                },
            )
            print(f"[Agent] Finalize response: {resp.status_code}")
    except Exception as e:
        print(f"[Agent] Failed to finalize job: {e}")

    _orchestrator_proc = None


@app.get("/health")
async def health():
    return {"ok": True, "worker_id": WORKER_ID, "scanning": _is_orchestrator_running()}


@app.on_event("startup")
async def on_startup():
    await _register()
    asyncio.create_task(_heartbeat_loop())


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8765)
