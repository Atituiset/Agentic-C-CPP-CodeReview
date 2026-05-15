from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional, List


class JobCreate(BaseModel):
    repo_path: str = Field(default=".")
    mode: str = Field(pattern="^(diff|files)$")
    target_commit: Optional[str] = None
    file_paths: Optional[List[str]] = None


class JobResponse(BaseModel):
    id: str
    repo_path: str
    mode: str
    target_commit: Optional[str] = None
    file_paths: Optional[List[str]] = None
    status: str
    total_files: int = 0
    completed_files: int = 0
    failed_files: int = 0
    report_dir: Optional[str] = None
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TaskResponse(BaseModel):
    id: str
    job_id: str
    file_path: str
    slot_id: Optional[int] = None
    worker_id: Optional[str] = None
    status: str
    report_file: Optional[str] = None
    log_file: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    return_code: Optional[int] = None
    error_message: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# Worker schemas
class WorkerRegister(BaseModel):
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    capabilities: Optional[dict] = None


class WorkerHeartbeat(BaseModel):
    status: str = "idle"
    current_job_id: Optional[str] = None


class WorkerResponse(BaseModel):
    id: str
    worker_id: str
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    status: str
    current_job_id: Optional[str] = None
    last_heartbeat: Optional[datetime] = None
    registered_at: Optional[datetime] = None
    capabilities: Optional[dict] = None
    model_config = ConfigDict(from_attributes=True)


class SlotAcquirePayload(BaseModel):
    task_id: str
    file_path: str


class SlotPushPayload(BaseModel):
    log_type: str = Field(default="stdout")
    content: str


class SlotStatusPayload(BaseModel):
    status: str
    duration: Optional[float] = 0.0
