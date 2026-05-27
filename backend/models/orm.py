import uuid
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    DateTime,
    func,
    ForeignKey,
    Text,
    Boolean,
)
from sqlalchemy.orm import relationship
from backend.database import Base


def generate_uuid():
    return str(uuid.uuid4())


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    repo_path = Column(Text, nullable=False)
    mode = Column(String(16), nullable=False)  # diff | files | full
    target_commit = Column(String(64), nullable=True)
    file_paths = Column(Text, nullable=True)  # JSON array string
    status = Column(
        String(16), default="pending"
    )  # pending | queued | running | completed | failed | cancelled | interrupted | resumed
    total_files = Column(Integer, default=0)
    completed_files = Column(Integer, default=0)
    failed_files = Column(Integer, default=0)
    report_dir = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    # Checkpoint for resume: JSON {completed: [file_paths], failed: [file_paths]}
    checkpoint_data = Column(Text, nullable=True)
    # Git commit hash at scan start (for incremental sync)
    base_commit = Column(String(64), nullable=True)
    # Scan stats: JSON {total_files, added_files, modified_files, deleted_files, changed_lines}
    scan_stats = Column(Text, nullable=True)
    # If this job is a resume of another interrupted job
    resumed_from_id = Column(String(36), ForeignKey("jobs.id"), nullable=True)
    assigned_worker_id = Column(String(64), nullable=True)
    dispatch_error = Column(Text, nullable=True)

    tasks = relationship(
        "Task", back_populates="job", cascade="all, delete-orphan"
    )


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    job_id = Column(String(36), ForeignKey("jobs.id"), nullable=False)
    file_path = Column(Text, nullable=False)
    slot_id = Column(Integer, nullable=True)
    worker_id = Column(String(64), nullable=True)
    status = Column(
        String(16), default="pending"
    )  # pending | running | done | failed
    report_file = Column(Text, nullable=True)
    log_file = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Float, nullable=True)
    return_code = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)

    job = relationship("Job", back_populates="tasks")


class Worker(Base):
    __tablename__ = "workers"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    worker_id = Column(String(64), unique=True, nullable=False)
    hostname = Column(String(256), nullable=True)
    ip_address = Column(String(64), nullable=True)
    status = Column(String(16), default="idle")
    current_job_id = Column(String(36), nullable=True)
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)
    registered_at = Column(DateTime(timezone=True), server_default=func.now())
    capabilities = Column(Text, nullable=True)
    show_thinking = Column(Boolean, default=True)
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    ssh_host = Column(String(256), nullable=True)
    ssh_port = Column(Integer, default=22)
    ssh_username = Column(String(128), nullable=True)
    ssh_key = Column(Text, nullable=True)
    ssh_password = Column(Text, nullable=True)
    deploy_status = Column(String(16), default="pending")
    deploy_error = Column(Text, nullable=True)
    deploy_logs = Column(Text, nullable=True)
    repo_path = Column(Text, nullable=True)
    scan_mode = Column(String(16), default="full")
    target_commit = Column(String(64), nullable=True)
    cared_paths = Column(Text, nullable=True)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    username = Column(String(128), unique=True, nullable=False)
    display_name = Column(String(256), nullable=True)
    password_hash = Column(String(256), nullable=False)
    role = Column(String(16), nullable=False)  # admin | committer | user
    show_thinking = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)


class Vulnerability(Base):
    __tablename__ = "vulnerabilities"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    job_id = Column(String(36), ForeignKey("jobs.id"), nullable=False)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=True)
    worker_id = Column(String(64), nullable=True)
    vuln_id = Column(String(32), nullable=False)
    file_path = Column(Text, nullable=False)
    line_start = Column(Integer, nullable=True)
    line_end = Column(Integer, nullable=True)
    severity = Column(String(16), nullable=False)
    vuln_type = Column(String(32), nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    raw_json = Column(Text, nullable=True)
    status = Column(String(16), default="open")
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    accepted_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    rejected_at = Column(DateTime(timezone=True), nullable=True)
    rejected_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    assigned_to = Column(String(36), ForeignKey("users.id"), nullable=True)


class MemoryRule(Base):
    __tablename__ = "memory_rules"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    source_vuln_id = Column(String(36), ForeignKey("vulnerabilities.id"), nullable=True)
    rule_type = Column(String(16), nullable=False)  # positive | negative
    scope = Column(String(16), nullable=False)  # personal | global
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    file_pattern = Column(String(512), nullable=True)
    code_pattern = Column(String(512), nullable=True)
    vuln_type_filter = Column(String(32), nullable=True)
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(String(36), ForeignKey("users.id"), nullable=True)


class SchedulerConfig(Base):
    """Persistent storage for APScheduler job configurations."""
    __tablename__ = "scheduler_configs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    job_name = Column(String(64), unique=True, nullable=False)
    job_type = Column(String(32), nullable=False)  # scan | stop
    cron_expression = Column(String(64), nullable=False)
    is_enabled = Column(Boolean, default=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WorkerGitStatus(Base):
    """Per-worker node git status snapshot."""
    __tablename__ = "worker_git_statuses"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    worker_id = Column(String(64), unique=True, nullable=False)
    head_commit = Column(String(64), nullable=True)
    added_files = Column(Integer, default=0)
    modified_files = Column(Integer, default=0)
    deleted_files = Column(Integer, default=0)
    changed_lines = Column(Integer, default=0)
    total_cpp_files = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WorkerScheduleConfig(Base):
    """Per-worker scan schedule configuration (user-configurable)."""
    __tablename__ = "worker_schedule_configs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    worker_id = Column(String(64), unique=True, nullable=False)
    scan_hour = Column(Integer, default=0)
    scan_minute = Column(Integer, default=0)
    stop_hour = Column(Integer, default=9)
    stop_minute = Column(Integer, default=0)
    is_enabled = Column(Boolean, default=True)
    timezone = Column(String(32), default="Asia/Shanghai")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
