import pytest


def test_fastapi_imports():
    import fastapi
    import uvicorn
    import sqlalchemy
    import alembic
    import redis
    import httpx
    assert fastapi.__version__ >= "0.100.0"


def test_backend_modules_import():
    from backend import config, database, redis_client
    from backend.models import schemas, orm
    from backend.routers import jobs, sse, slots, reports
    from backend.services import runner, worker
