import pytest
from sqlalchemy import inspect
from sqlalchemy.orm import Session
from backend.database import engine, Base
from backend.models.orm import Job, Task, Worker, User, Vulnerability, MemoryRule


def test_extended_tables_created():
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    assert "jobs" in tables
    assert "tasks" in tables
    assert "workers" in tables
    assert "users" in tables
    assert "vulnerabilities" in tables
    assert "memory_rules" in tables


def test_user_crud():
    Base.metadata.create_all(bind=engine)
    db = Session(bind=engine)
    user = User(
        id="user-1",
        username="alice",
        display_name="Alice",
        password_hash="hash123",
        role="admin",
    )
    db.add(user)
    db.commit()
    fetched = db.query(User).filter_by(id="user-1").first()
    assert fetched is not None
    assert fetched.username == "alice"
    assert fetched.role == "admin"
    db.close()


def test_user_self_referential_created_by():
    Base.metadata.create_all(bind=engine)
    db = Session(bind=engine)
    creator = User(
        id="user-creator",
        username="creator",
        password_hash="hash",
        role="admin",
    )
    db.add(creator)
    db.commit()
    user = User(
        id="user-2",
        username="bob",
        password_hash="hash456",
        role="user",
        created_by="user-creator",
    )
    db.add(user)
    db.commit()
    fetched = db.query(User).filter_by(id="user-2").first()
    assert fetched.created_by == "user-creator"
    db.close()


def test_vulnerability_crud():
    Base.metadata.create_all(bind=engine)
    db = Session(bind=engine)
    job = Job(id="job-vuln", repo_path=".", mode="files", status="running")
    db.add(job)
    db.commit()
    vuln = Vulnerability(
        id="vuln-1",
        job_id="job-vuln",
        vuln_id="CVE-2024-0001",
        file_path="src/main.c",
        severity="high",
        vuln_type="buffer_overflow",
        title="Buffer overflow in main",
    )
    db.add(vuln)
    db.commit()
    fetched = db.query(Vulnerability).filter_by(id="vuln-1").first()
    assert fetched is not None
    assert fetched.severity == "high"
    assert fetched.status == "open"
    db.close()


def test_vulnerability_with_task_and_user_refs():
    Base.metadata.create_all(bind=engine)
    db = Session(bind=engine)
    job = Job(id="job-vuln2", repo_path=".", mode="files", status="running")
    db.add(job)
    task = Task(id="task-vuln", job_id="job-vuln2", file_path="a.c", status="running")
    db.add(task)
    user = User(id="user-vuln", username="carol", password_hash="hash", role="committer")
    db.add(user)
    db.commit()
    vuln = Vulnerability(
        id="vuln-2",
        job_id="job-vuln2",
        task_id="task-vuln",
        vuln_id="CVE-2024-0002",
        file_path="src/util.c",
        severity="medium",
        vuln_type="use_after_free",
        title="UAF in util",
        assigned_to="user-vuln",
    )
    db.add(vuln)
    db.commit()
    fetched = db.query(Vulnerability).filter_by(id="vuln-2").first()
    assert fetched.task_id == "task-vuln"
    assert fetched.assigned_to == "user-vuln"
    db.close()


def test_memory_rule_crud():
    Base.metadata.create_all(bind=engine)
    db = Session(bind=engine)
    rule = MemoryRule(
        id="rule-1",
        rule_type="positive",
        scope="global",
        title="Ignore test files",
    )
    db.add(rule)
    db.commit()
    fetched = db.query(MemoryRule).filter_by(id="rule-1").first()
    assert fetched is not None
    assert fetched.rule_type == "positive"
    assert fetched.scope == "global"
    assert fetched.is_active is True
    db.close()


def test_memory_rule_with_vuln_and_user_refs():
    Base.metadata.create_all(bind=engine)
    db = Session(bind=engine)
    job = Job(id="job-rule", repo_path=".", mode="files", status="running")
    db.add(job)
    db.commit()
    vuln = Vulnerability(
        id="vuln-rule",
        job_id="job-rule",
        vuln_id="CVE-2024-0003",
        file_path="src/x.c",
        severity="low",
        vuln_type="info_leak",
        title="Info leak",
    )
    db.add(vuln)
    user = User(id="user-rule", username="dave", password_hash="hash", role="user")
    db.add(user)
    db.commit()
    rule = MemoryRule(
        id="rule-2",
        source_vuln_id="vuln-rule",
        rule_type="negative",
        scope="personal",
        owner_id="user-rule",
        title="Filter info leaks",
        created_by="user-rule",
    )
    db.add(rule)
    db.commit()
    fetched = db.query(MemoryRule).filter_by(id="rule-2").first()
    assert fetched.source_vuln_id == "vuln-rule"
    assert fetched.owner_id == "user-rule"
    assert fetched.created_by == "user-rule"
    db.close()
