import pytest
import json
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, AsyncMock

from backend.services.scheduler import ScanScheduler, get_scheduler


class TestScanScheduler:
    @pytest.fixture
    def scheduler(self):
        return ScanScheduler()

    def test_request_cancel(self, scheduler):
        scheduler.set_running_job("job-123")
        assert scheduler.request_cancel("job-123") is True
        assert scheduler.is_cancel_requested() is True

    def test_request_cancel_wrong_job(self, scheduler):
        scheduler.set_running_job("job-123")
        assert scheduler.request_cancel("job-456") is False

    def test_clear_cancel(self, scheduler):
        scheduler.set_running_job("job-123")
        scheduler.request_cancel("job-123")
        scheduler.clear_cancel()
        assert scheduler.is_cancel_requested() is False
        assert scheduler._running_job_id is None

    def test_get_status_when_not_started(self, scheduler):
        status = scheduler.get_status()
        assert status["is_enabled"] is False
        assert status["is_running"] is False

    @patch("backend.services.scheduler.AsyncIOScheduler")
    def test_start_creates_jobs(self, mock_scheduler_class, scheduler):
        mock_sched = MagicMock()
        mock_scheduler_class.return_value = mock_sched
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(scheduler.start())
        finally:
            loop.close()
        mock_sched.add_job.assert_called()
        mock_sched.start.assert_called_once()


class TestGetSchedulerSingleton:
    def test_returns_same_instance(self):
        s1 = get_scheduler()
        s2 = get_scheduler()
        assert s1 is s2
