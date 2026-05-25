import asyncio
import json
import logging
import os
import tempfile
from pathlib import Path

import asyncssh
from backend.database import SessionLocal
from backend.models.orm import Worker

logger = logging.getLogger("deployer")

AGENT_TEMPLATE_PATH = Path(__file__).parent.parent.parent / "worker" / "agent.py"


class DeploymentError(Exception):
    pass


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
        db.commit()

        await _do_deploy(worker)

        worker.deploy_status = "deployed"
        worker.deploy_error = None
        db.commit()
        logger.info(f"Worker {worker_id} deployed successfully")

    except Exception as e:
        logger.error(f"Deployment failed for {worker_id}: {e}")
        if worker is not None:
            worker.deploy_status = "failed"
            worker.deploy_error = str(e)
            db.commit()
        raise
    finally:
        db.close()


async def _do_deploy(worker: Worker):
    """Execute the actual SSH deployment logic."""
    if not worker.ssh_host or not worker.ssh_username:
        raise DeploymentError("SSH host and username are required")

    conn_kwargs = {
        "host": worker.ssh_host,
        "port": worker.ssh_port or 22,
        "username": worker.ssh_username,
        # Intentionally disabled for dynamically provisioned workers in intranet environments
        "known_hosts": None,
    }
    if worker.ssh_key:
        conn_kwargs["client_keys"] = [asyncssh.import_private_key(worker.ssh_key)]

    async with asyncssh.connect(**conn_kwargs) as conn:
        # 1. Check Python version
        result = await conn.run("python3 --version")
        if result.exit_status != 0:
            raise DeploymentError("python3 not found on remote machine")
        version_line = result.stdout.strip()
        try:
            version_str = version_line.split()[1]
            major, minor = map(int, version_str.split(".")[:2])
            if major < 3 or (major == 3 and minor < 10):
                raise DeploymentError(f"Python 3.10+ required, found {version_str}")
        except (IndexError, ValueError):
            logger.warning(f"Could not parse Python version: {version_line}")

        # 2. Check and install dependencies
        check = await conn.run(
            "python3 -c 'import redis.asyncio, httpx, fastapi, uvicorn' 2>/dev/null"
        )
        if check.exit_status != 0:
            logger.info("Installing agent dependencies on remote machine")
            install = await conn.run(
                "python3 -m pip install --user redis httpx fastapi uvicorn",
                timeout=120,
            )
            if install.exit_status != 0:
                raise DeploymentError(f"pip install failed: {install.stderr}")

        # 3. Create Agent directory
        await conn.run("mkdir -p ~/.opencode-agent/logs")

        # 4. SFTP upload files
        backend_url = _get_backend_url()
        redis_url = _get_redis_url()

        config = {
            "worker_id": worker.worker_id,
            "backend_url": backend_url,
            "redis_url": redis_url,
            "repo_path": worker.repo_path or ".",
        }

        async with conn.start_sftp_client() as sftp:
            await sftp.put(
                str(AGENT_TEMPLATE_PATH),
                ".opencode-agent/agent.py",
            )
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                f.write(json.dumps(config, indent=2))
                temp_path = f.name
            await sftp.put(temp_path, ".opencode-agent/config.json")
            Path(temp_path).unlink()

        # 5. Start Agent
        await conn.run(
            "cd ~/.opencode-agent && "
            "(kill $(cat agent.pid 2>/dev/null) 2>/dev/null; sleep 1; true) && "
            "nohup python3 agent.py > logs/agent.log 2>&1 & "
            "echo $! > agent.pid",
        )

        pid_check = await conn.run("ps -p $(cat ~/.opencode-agent/agent.pid) > /dev/null 2>&1")
        if pid_check.exit_status != 0:
            raise DeploymentError("Agent process did not start")

        # 6. Wait for Agent registration (up to 60 seconds)
        db2 = SessionLocal()
        try:
            for _ in range(30):
                await asyncio.sleep(2)
                w = db2.query(Worker).filter(Worker.worker_id == worker.worker_id).first()
                if w and w.last_heartbeat:
                    logger.info(f"Agent registered for {worker.worker_id}")
                    return
            raise DeploymentError("Agent did not register within 60 seconds")
        finally:
            db2.close()


def _get_backend_url() -> str:
    return os.environ.get("BACKEND_URL", "http://localhost:8000")


def _get_redis_url() -> str:
    return os.environ.get("REDIS_URL", "redis://localhost:6379/0")
