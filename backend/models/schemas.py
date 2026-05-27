from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional, List


class JobCreate(BaseModel):
    repo_path: str = Field(default=".")
    mode: str = Field(pattern="^(diff|files|full)$")
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
    worker_id: Optional[str] = None
    dispatch_error: Optional[str] = None

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
    # Node-level git stats (optional, reported by worker)
    head_commit: Optional[str] = None
    added_files: int = 0
    modified_files: int = 0
    deleted_files: int = 0
    changed_lines: int = 0
    total_cpp_files: int = 0


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
    show_thinking: bool = True
    owner_id: Optional[str] = None
    ssh_host: Optional[str] = None
    ssh_port: int = 22
    ssh_username: Optional[str] = None
    deploy_status: str = "pending"
    deploy_error: Optional[str] = None
    repo_path: Optional[str] = None
    scan_mode: str = "full"
    target_commit: Optional[str] = None
    cared_paths: Optional[List[str]] = None
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


# Auth schemas
class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    display_name: Optional[str] = Field(default=None, max_length=256)
    password: str = Field(min_length=1)
    role: str = Field(pattern="^(admin|committer|user)$")


class UserResponse(BaseModel):
    id: str
    username: str
    display_name: Optional[str] = None
    role: str
    show_thinking: bool = True
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class LoginPayload(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: str
    username: str
    display_name: Optional[str] = None
    role: str
    show_thinking: bool = True

    model_config = ConfigDict(from_attributes=True)


class VulnerabilityResponse(BaseModel):
    id: str
    job_id: str
    task_id: Optional[str] = None
    worker_id: Optional[str] = None
    vuln_id: str
    file_path: str
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    severity: str
    vuln_type: str
    title: str
    description: Optional[str] = None
    raw_json: Optional[str] = None
    status: str
    generated_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    accepted_by: Optional[str] = None
    rejected_at: Optional[datetime] = None
    rejected_by: Optional[str] = None
    assigned_to: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class JobResumeRequest(BaseModel):
    resume_from_job_id: str


class GitSyncResponse(BaseModel):
    base_commit: Optional[str] = None
    current_commit: str
    added_files: int = 0
    modified_files: int = 0
    deleted_files: int = 0
    changed_lines: int = 0
    total_cpp_files: int = 0


class SchedulerStatusResponse(BaseModel):
    is_enabled: bool = True
    next_scan_time: Optional[str] = None
    next_stop_time: Optional[str] = None
    last_scan_time: Optional[str] = None
    last_stop_time: Optional[str] = None
    is_running: bool = False
    # Per-worker fields
    scan_hour: Optional[int] = None
    scan_minute: Optional[int] = None
    stop_hour: Optional[int] = None
    stop_minute: Optional[int] = None
    timezone: Optional[str] = None


class WorkerGitStatusResponse(BaseModel):
    worker_id: str
    head_commit: Optional[str] = None
    added_files: int = 0
    modified_files: int = 0
    deleted_files: int = 0
    changed_lines: int = 0
    total_cpp_files: int = 0
    updated_at: Optional[datetime] = None


class WorkerScheduleConfigResponse(BaseModel):
    worker_id: str
    scan_hour: int = 0
    scan_minute: int = 0
    stop_hour: int = 9
    stop_minute: int = 0
    is_enabled: bool = True
    timezone: str = "Asia/Shanghai"


class WorkerScheduleConfigUpdate(BaseModel):
    scan_hour: Optional[int] = None
    scan_minute: Optional[int] = None
    stop_hour: Optional[int] = None
    stop_minute: Optional[int] = None
    is_enabled: Optional[bool] = None
    timezone: Optional[str] = None


class WorkerCreate(BaseModel):
    worker_id: str = Field(min_length=1, max_length=64)
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    ssh_host: Optional[str] = None
    ssh_port: int = 22
    ssh_username: Optional[str] = None
    ssh_key: Optional[str] = None
    ssh_password: Optional[str] = None
    repo_path: Optional[str] = None
    scan_mode: str = Field(default="full", pattern="^(full|diff)$")
    target_commit: Optional[str] = None
    cared_paths: Optional[List[str]] = None


class WorkerUpdate(BaseModel):
    ssh_host: Optional[str] = None
    ssh_port: Optional[int] = None
    ssh_username: Optional[str] = None
    ssh_password: Optional[str] = None
    repo_path: Optional[str] = None
    scan_mode: Optional[str] = Field(default=None, pattern="^(full|diff)$")
    target_commit: Optional[str] = None
    cared_paths: Optional[List[str]] = None


class WorkerDeployRequest(BaseModel):
    worker_id: str


class ScanRequest(BaseModel):
    job_id: str
    repo_path: str
    mode: str = Field(pattern="^(full|diff|files)$")
    report_dir: str


class JobFinalizePayload(BaseModel):
    status: str = Field(pattern="^(completed|failed|interrupted)$")
    worker_id: str
    completed_files: int = 0
    failed_files: int = 0
    tasks: Optional[List[dict]] = None
    vulnerabilities: Optional[List[dict]] = None
