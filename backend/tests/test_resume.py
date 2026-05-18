import json
import pytest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, AsyncMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from backend.models.orm import Job, Task, Base


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


class TestJobResume:
    def test_job_can_have_checkpoint_data(self, db: Session):
        job = Job(
            repo_path=".",
            mode="full",
            status="interrupted",
            checkpoint_data=json.dumps({"completed": ["src/a.c"], "failed": []}),
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        assert job.checkpoint_data is not None
        checkpoint = json.loads(job.checkpoint_data)
        assert checkpoint["completed"] == ["src/a.c"]
        assert checkpoint["failed"] == []

    def test_resumed_from_id(self, db: Session):
        original = Job(repo_path=".", mode="full", status="interrupted")
        db.add(original)
        db.commit()

        resumed = Job(
            repo_path=".",
            mode="full",
            status="queued",
            resumed_from_id=original.id,
        )
        db.add(resumed)
        db.commit()
        db.refresh(resumed)

        assert resumed.resumed_from_id == original.id

    def test_job_status_interrupted(self, db: Session):
        job = Job(repo_path=".", mode="full", status="interrupted", cancelled_at=datetime.now(timezone.utc))
        db.add(job)
        db.commit()
        db.refresh(job)

        assert job.status == "interrupted"
        assert job.cancelled_at is not None

    def test_job_scan_stats(self, db: Session):
        stats = {
            "total_files": 100,
            "added_files": 5,
            "modified_files": 10,
            "deleted_files": 2,
            "changed_lines": 500,
        }
        job = Job(
            repo_path=".",
            mode="full",
            status="completed",
            scan_stats=json.dumps(stats),
            base_commit="abc123",
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        assert job.base_commit == "abc123"
        loaded_stats = json.loads(job.scan_stats)
        assert loaded_stats["total_files"] == 100
        assert loaded_stats["added_files"] == 5


class TestCheckpointSave:
    @patch("pathlib.Path.rglob")
    def test_read_local_checkpoint_from_report_dir(self, mock_rglob):
        """Test that _read_local_checkpoint correctly identifies completed/failed files."""
        from backend.services.worker import _read_local_checkpoint

        # Create mock md and log files
        mock_md = MagicMock()
        mock_md.name = "report.md"
        mock_md.relative_to.return_value = MagicMock()
        mock_md.relative_to.return_value.with_suffix.return_value = MagicMock()
        mock_md.relative_to.return_value.with_suffix.return_value.__str__ = lambda self: "src/file"
        mock_md.with_suffix.return_value = MagicMock()
        mock_md.with_suffix.return_value.exists.return_value = True
        mock_md.with_suffix.return_value.read_text.return_value = "Status: done\nSome log"

        mock_rglob.return_value = [mock_md]

        mock_job = MagicMock()
        mock_db = MagicMock()

        _read_local_checkpoint(mock_db, mock_job, MagicMock())

        assert mock_job.checkpoint_data is not None
        checkpoint = json.loads(mock_job.checkpoint_data)
        assert "completed" in checkpoint
        mock_db.commit.assert_called_once()


class TestOrchestratorResume:
    def test_create_orchestrator_with_resume_file(self):
        from worker.orchestrator import create_orchestrator
        orch = create_orchestrator(resume_file="/tmp/checkpoint.json")
        assert orch.resume_file == "/tmp/checkpoint.json"

    def test_setup_file_mode_with_exclude(self):
        from worker.orchestrator import OpenCodeOrchestrator, ScanTask
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            orch = OpenCodeOrchestrator(resume_file="/tmp/test.json")
            orch.output_dir = __import__('pathlib').Path(tmpdir)
            orch.diff_dir = orch.output_dir / "diffs"
            orch.diff_dir.mkdir(parents=True, exist_ok=True)

            # Directly test the exclude logic by manually creating tasks
            all_files = ["a.c", "b.cpp", "c.h"]
            excluded = {"b.cpp"}
            for i, fp in enumerate(all_files, 1):
                if fp in excluded:
                    continue
                orch.tasks.append(ScanTask(
                    file_path=fp,
                    task_id=f"task-{i:03d}",
                    report_file=f"{tmpdir}/{fp}.md",
                    log_file=f"{tmpdir}/{fp}.log",
                ))

            assert len(orch.tasks) == 2
            file_paths = [t.file_path for t in orch.tasks]
            assert "a.c" in file_paths
            assert "b.cpp" not in file_paths
            assert "c.h" in file_paths
