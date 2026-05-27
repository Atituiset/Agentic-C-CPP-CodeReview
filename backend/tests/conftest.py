import os
os.environ["DATABASE_URL"] = "sqlite:///./data/test_db.db"

import pytest
from backend.database import engine, Base
from backend.redis_client import reset_redis_pool
# Explicitly import all models to register them on Base.metadata
from backend.models.orm import (
    Job, Task, Worker, User, Vulnerability,
    MemoryRule, SchedulerConfig, WorkerGitStatus, WorkerScheduleConfig
)

@pytest.fixture(autouse=True, scope="function")
def clean_db():
    reset_redis_pool()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield

