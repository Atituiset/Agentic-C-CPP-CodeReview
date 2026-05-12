import pytest
from sqlalchemy import inspect
from backend.database import engine, Base
from backend.models.orm import Job, Task


def test_tables_created():
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    assert "jobs" in inspector.get_table_names()
    assert "tasks" in inspector.get_table_names()


def test_job_crud():
    from sqlalchemy.orm import Session

    Base.metadata.create_all(bind=engine)
    db = Session(bind=engine)
    job = Job(
        id="test-job-1", repo_path=".", mode="files", status="pending"
    )
    db.add(job)
    db.commit()
    assert db.query(Job).count() == 1


def test_task_relationship():
    from sqlalchemy.orm import Session

    Base.metadata.create_all(bind=engine)
    db = Session(bind=engine)
    job = Job(
        id="test-job-2", repo_path=".", mode="files", status="running"
    )
    db.add(job)
    task = Task(
        id="task-1",
        job_id="test-job-2",
        file_path="test.c",
        status="running",
    )
    db.add(task)
    db.commit()
    assert len(db.query(Job).filter_by(id="test-job-2").first().tasks) == 1
