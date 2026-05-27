import asyncio
import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import asyncssh
from backend.database import SessionLocal
from backend.models.orm import Worker

logger = logging.getLogger("deployer")

AGENT_TEMPLATE_PATH = Path(__file__).parent.parent.parent / "worker" / "agent.py"


class DeploymentError(Exception):
    pass


def _log_step(db, worker: Worker, step: str, message: str):
    """Append a deployment log entry to worker.deploy_logs."""
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "step": step,
        "msg": message,
    }
    logs = []
    if worker.deploy_logs:
        try:
            logs = json.loads(worker.deploy_logs)
        except Exception:
            pass
    logs.append(entry)
    worker.deploy_logs = json.dumps(logs, ensure_ascii=False)
    db.commit()


async def deploy_worker(worker_id: str):
    """Connect to the Worker machine via SSH, check the environment, and deploy the Agent."""
    db = SessionLocal()
    worker = None
    try:
        worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
        if not worker:
            raise DeploymentError(f"Worker {worker_id} not found")

        worker.deploy_status = "deploying"
        worker.deploy_error = None
        worker.deploy_logs = json.dumps([{
            "ts": datetime.now(timezone.utc).isoformat(),
            "step": "start",
            "msg": f"Deployment started for {worker_id}",
        }], ensure_ascii=False)
        db.commit()

        await _do_deploy(worker, db)

        worker.deploy_status = "deployed"
        worker.deploy_error = None
        _log_step(db, worker, "done", "Deployment completed successfully")
        logger.info(f"Worker {worker_id} deployed successfully")

    except Exception as e:
        logger.error(f"Deployment failed for {worker_id}: {e}")
        if worker is not None:
            worker.deploy_status = "failed"
            worker.deploy_error = str(e)
            _log_step(db, worker, "error", str(e))
            db.commit()
        raise
    finally:
        db.close()


async def _do_deploy(worker: Worker, db):
    """Execute the actual SSH deployment logic."""
    if not worker.ssh_host or not worker.ssh_username:
        raise DeploymentError("SSH host and username are required")

    _log_step(db, worker, "connect", f"Connecting to {worker.ssh_host}:{worker.ssh_port or 22} as {worker.ssh_username}")

    conn_kwargs = {
        "host": worker.ssh_host,
        "port": worker.ssh_port or 22,
        "username": worker.ssh_username,
        # Intentionally disabled for dynamically provisioned workers in intranet environments
        "known_hosts": None,
    }
    if worker.ssh_key:
        conn_kwargs["client_keys"] = [asyncssh.import_private_key(worker.ssh_key)]
        _log_step(db, worker, "auth", "Using user-provided SSH private key")
    elif worker.ssh_password:
        conn_kwargs["password"] = worker.ssh_password
        _log_step(db, worker, "auth", "Using password authentication")
    else:
        from backend.services.deploy_key import get_private_key_path
        conn_kwargs["client_keys"] = [str(get_private_key_path())]
        _log_step(db, worker, "auth", "Using backend deploy key")

    async with asyncssh.connect(**conn_kwargs) as conn:
        _log_step(db, worker, "connected", "SSH connection established")

        # 1. Check Python version
        _log_step(db, worker, "check", "Checking Python 3 version...")
        result = await conn.run("python3 --version")
        if result.exit_status != 0:
            raise DeploymentError("python3 not found on remote machine")
        version_line = result.stdout.strip()
        _log_step(db, worker, "check", f"Python version: {version_line}")
        try:
            version_str = version_line.split()[1]
            major, minor = map(int, version_str.split(".")[:2])
            if major < 3 or (major == 3 and minor < 10):
                raise DeploymentError(f"Python 3.10+ required, found {version_str}")
        except (IndexError, ValueError):
            logger.warning(f"Could not parse Python version: {version_line}")

        # 2. Check and install dependencies
        _log_step(db, worker, "deps", "Checking agent dependencies (httpx, fastapi, uvicorn, redis)...")
        check = await conn.run(
            "python3 -c 'import redis.asyncio, httpx, fastapi, uvicorn' 2>/dev/null"
        )
        if check.exit_status != 0:
            _log_step(db, worker, "deps", "Dependencies missing, installing...")
            install = await conn.run(
                "python3 -m pip install --user redis httpx fastapi uvicorn",
                timeout=120,
            )
            if install.exit_status != 0:
                raise DeploymentError(f"pip install failed: {install.stderr}")
            _log_step(db, worker, "deps", "Dependencies installed successfully")
        else:
            _log_step(db, worker, "deps", "All dependencies already satisfied")

        # 3. Create Agent directory
        _log_step(db, worker, "mkdir", "Creating ~/.opencode-agent directory...")
        await conn.run("mkdir -p ~/.opencode-agent/logs ~/.opencode-agent/worker")

        # 4. SFTP upload files
        backend_url = _get_backend_url()
        redis_url = _get_redis_url()

        config = {
            "worker_id": worker.worker_id,
            "backend_url": backend_url,
            "redis_url": redis_url,
            "repo_path": worker.repo_path or ".",
        }
        _log_step(db, worker, "upload", f"Uploading agent.py, orchestrator.py, git_sync.py and config.json (backend={backend_url})")

        async with conn.start_sftp_client() as sftp:
            await sftp.put(
                str(AGENT_TEMPLATE_PATH),
                ".opencode-agent/agent.py",
            )
            await sftp.put(
                str(AGENT_TEMPLATE_PATH.parent / "orchestrator.py"),
                ".opencode-agent/orchestrator.py",
            )
            await sftp.put(
                str(AGENT_TEMPLATE_PATH.parent / "git_sync.py"),
                ".opencode-agent/worker/git_sync.py",
            )
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                f.write(json.dumps(config, indent=2))
                temp_path = f.name
            await sftp.put(temp_path, ".opencode-agent/config.json")
            Path(temp_path).unlink()
        _log_step(db, worker, "upload", "Files uploaded successfully")

        # 5. Kill any existing agent and wait for port release
        _log_step(db, worker, "start", "Stopping any existing agent...")
        await conn.run(
            "pkill -f 'python3 agent.py' 2>/dev/null; sleep 2; true",
        )

        # 6. Start Agent
        _log_step(db, worker, "start", "Starting agent process...")
        start_result = await conn.run(
            "cd ~/.opencode-agent && "
            "nohup python3 agent.py > logs/agent.log 2>&1 & "
            "sleep 2 && "
            "pgrep -f 'python3 agent.py' | head -1 > agent.pid",
        )
        _log_step(db, worker, "start", f"Agent start command exit code: {start_result.exit_status}")

        # Verify agent process is running
        pid_check = await conn.run("pgrep -f 'python3 agent.py' > /dev/null 2>&1")
        if pid_check.exit_status != 0:
            raise DeploymentError("Agent process did not start")
        _log_step(db, worker, "start", "Agent process is running")

        # 6. Wait for Agent registration (up to 60 seconds)
        _log_step(db, worker, "wait", "Waiting for agent to register with backend (max 60s)...")
        db2 = SessionLocal()
        try:
            for i in range(30):
                await asyncio.sleep(2)
                w = db2.query(Worker).filter(Worker.worker_id == worker.worker_id).first()
                if w and w.last_heartbeat:
                    _log_step(db, worker, "registered", f"Agent registered after {(i+1)*2} seconds")
                    logger.info(f"Agent registered for {worker.worker_id}")
                    return
            raise DeploymentError("Agent did not register within 60 seconds")
        finally:
            db2.close()


def _get_backend_url() -> str:
    return os.environ.get("BACKEND_URL", "http://localhost:3000")


def _get_redis_url() -> str:
    return os.environ.get("REDIS_URL", "redis://localhost:6379/0")
