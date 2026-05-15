import json
import pytest

from backend.services.report_parser import parse_vulnerability_report


SAMPLE_MARKDOWN = """\
## VULN-001: SQL Injection in Login Handler
- **Severity**: High
- **File**: src/auth/login.py
- **Lines**: 23-29
- **Type**: sast_semgrep
The login handler directly interpolates user input into an SQL query without parameterization, allowing attackers to bypass authentication.

## VULN-002: Hardcoded API Key
- **Severity**: Medium
- **File**: src/config/settings.py
- **Lines**: 45
- **Type**: secret_scanning
An API key is hardcoded in the source code. It should be moved to environment variables or a secrets manager.

## VULN-003: Missing Input Validation
- **Severity**: Low
- **File**: src/utils/parser.py
- **Lines**: 10-15
- **Type**: sast_bandit
User-supplied data is not validated before being processed, which may lead to unexpected behavior.
"""


def test_parse_multiple_vulnerabilities():
    results = parse_vulnerability_report(
        SAMPLE_MARKDOWN,
        job_id="job-abc",
        task_id="task-xyz",
        worker_id="worker-1",
    )
    assert len(results) == 3

    # First vulnerability
    v1 = results[0]
    assert v1["job_id"] == "job-abc"
    assert v1["task_id"] == "task-xyz"
    assert v1["worker_id"] == "worker-1"
    assert v1["vuln_id"] == "VULN-001"
    assert v1["title"] == "SQL Injection in Login Handler"
    assert v1["severity"] == "High"
    assert v1["file_path"] == "src/auth/login.py"
    assert v1["line_start"] == 23
    assert v1["line_end"] == 29
    assert v1["vuln_type"] == "sast_semgrep"
    assert "directly interpolates" in v1["description"]
    assert v1["raw_json"] is not None
    raw = json.loads(v1["raw_json"])
    assert raw["vuln_id"] == "VULN-001"

    # Second vulnerability (single line)
    v2 = results[1]
    assert v2["vuln_id"] == "VULN-002"
    assert v2["title"] == "Hardcoded API Key"
    assert v2["severity"] == "Medium"
    assert v2["file_path"] == "src/config/settings.py"
    assert v2["line_start"] == 45
    assert v2["line_end"] == 45
    assert v2["vuln_type"] == "secret_scanning"
    assert "environment variables" in v2["description"]

    # Third vulnerability
    v3 = results[2]
    assert v3["vuln_id"] == "VULN-003"
    assert v3["title"] == "Missing Input Validation"
    assert v3["severity"] == "Low"
    assert v3["file_path"] == "src/utils/parser.py"
    assert v3["line_start"] == 10
    assert v3["line_end"] == 15
    assert v3["vuln_type"] == "sast_bandit"


def test_parse_empty_markdown():
    results = parse_vulnerability_report("", job_id="job-1")
    assert results == []


def test_parse_no_matching_headers():
    results = parse_vulnerability_report("# Just a regular report\nNothing here.", job_id="job-1")
    assert results == []


def test_parse_missing_optional_fields():
    markdown = """\
## VULN-004: Unknown Issue
- **Severity**: Critical
- **File**: src/main.c
Description without lines or type.
"""
    results = parse_vulnerability_report(markdown, job_id="job-1")
    assert len(results) == 1
    v = results[0]
    assert v["vuln_id"] == "VULN-004"
    assert v["title"] == "Unknown Issue"
    assert v["severity"] == "Critical"
    assert v["file_path"] == "src/main.c"
    assert v["line_start"] is None
    assert v["line_end"] is None
    assert v["vuln_type"] == "unknown"
    assert "Description without lines" in v["description"]


def test_parse_without_job_context():
    markdown = """\
## VULN-005: Standalone Finding
- **Severity**: High
- **File**: app.js
- **Lines**: 1-5
- **Type**: custom
Standalone description.
"""
    results = parse_vulnerability_report(markdown, job_id="job-standalone")
    assert len(results) == 1
    v = results[0]
    assert v["job_id"] == "job-standalone"
    assert v["task_id"] is None
    assert v["worker_id"] is None


def test_parse_multiline_description():
    markdown = """\
## VULN-006: Complex Bug
- **Severity**: High
- **File**: src/core/engine.py
- **Lines**: 100-110
- **Type**: sast_semgrep
This is a multiline description.

It has multiple paragraphs and details.
- Even a list inside the description.
"""
    results = parse_vulnerability_report(markdown, job_id="job-1")
    assert len(results) == 1
    v = results[0]
    assert "This is a multiline description." in v["description"]
    assert "It has multiple paragraphs" in v["description"]
    assert "Even a list inside" in v["description"]
