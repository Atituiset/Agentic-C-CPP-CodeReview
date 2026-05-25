import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.deployer import deploy_worker, DeploymentError


@pytest.mark.asyncio
async def test_deploy_worker_not_found():
    with pytest.raises(DeploymentError, match="not found"):
        await deploy_worker("nonexistent-worker")


@pytest.mark.asyncio
async def test_deploy_worker_missing_ssh_host():
    from backend.database import SessionLocal
    from backend.models.orm import Worker

    db = SessionLocal()
    worker = Worker(worker_id="test-worker-1", owner_id="test-user")
    db.add(worker)
    db.commit()

    with pytest.raises(DeploymentError, match="SSH host"):
        await deploy_worker("test-worker-1")

    db.delete(worker)
    db.commit()
    db.close()
