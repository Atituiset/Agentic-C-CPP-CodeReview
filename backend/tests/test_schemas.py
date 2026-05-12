from datetime import datetime
from backend.models.schemas import (
    JobCreate,
    JobResponse,
    TaskResponse,
    SlotPushPayload,
)


def test_job_create():
    j = JobCreate(repo_path=".", mode="files", file_paths=["a.c", "b.c"])
    assert j.repo_path == "."
    assert j.file_paths == ["a.c", "b.c"]


def test_job_response():
    j = JobResponse(
        id="j1",
        repo_path=".",
        mode="files",
        status="running",
        total_files=5,
        completed_files=2,
    )
    assert j.completed_files == 2


def test_slot_push():
    p = SlotPushPayload(log_type="stdout", content="hello")
    assert p.log_type == "stdout"
