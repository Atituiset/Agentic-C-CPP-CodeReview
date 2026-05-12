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
)
from sqlalchemy.orm import relationship
from backend.database import Base


def generate_uuid():
    return str(uuid.uuid4())


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    repo_path = Column(Text, nullable=False)
    mode = Column(String(16), nullable=False)  # diff | files
    target_commit = Column(String(64), nullable=True)
    file_paths = Column(Text, nullable=True)  # JSON array string
    status = Column(
        String(16), default="pending"
    )  # pending | queued | running | completed | failed | cancelled
    total_files = Column(Integer, default=0)
    completed_files = Column(Integer, default=0)
    failed_files = Column(Integer, default=0)
    report_dir = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    tasks = relationship(
        "Task", back_populates="job", cascade="all, delete-orphan"
    )


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    job_id = Column(String(36), ForeignKey("jobs.id"), nullable=False)
    file_path = Column(Text, nullable=False)
    slot_id = Column(Integer, nullable=True)
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
