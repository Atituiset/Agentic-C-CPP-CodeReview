import re
import json
from typing import List, Dict, Any, Optional


def parse_vulnerability_report(
    markdown: str,
    job_id: str,
    task_id: Optional[str] = None,
    worker_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Parse a markdown vulnerability report into structured dicts.

    Expected markdown format per vulnerability:

    ## VULN-001: Title of vulnerability
    - **Severity**: High
    - **File**: src/auth/session.cpp
    - **Lines**: 45-52
    - **Type**: sast_semgrep
    Description text here...
    """
    if not markdown or not markdown.strip():
        return []

    # Split by H2 headers matching ## VULN-<digits>: Title
    # Use a lookahead so the delimiter is preserved as part of the chunk.
    pattern = re.compile(r"(?=^##\s+VULN-\d+:\s+.+$)", re.MULTILINE)
    chunks = pattern.split(markdown)

    results: List[Dict[str, Any]] = []

    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue

        # Extract vuln_id and title from the H2 header
        header_match = re.match(r"^##\s+(VULN-\d+):\s+(.+)$", chunk, re.MULTILINE)
        if not header_match:
            continue

        vuln_id = header_match.group(1).strip()
        title = header_match.group(2).strip()

        # Remove the header line from the body to simplify parsing
        body = re.sub(r"^##\s+.*$", "", chunk, count=1, flags=re.MULTILINE).strip()

        # Extract bullet fields
        severity = _extract_bullet(body, "Severity")
        file_path = _extract_bullet(body, "File")
        lines_str = _extract_bullet(body, "Lines")
        vuln_type = _extract_bullet(body, "Type")

        line_start, line_end = _parse_lines(lines_str)

        # Description is everything after the bullet list (or the whole body if no bullets)
        description = _extract_description(body)

        record: Dict[str, Any] = {
            "job_id": job_id,
            "task_id": task_id,
            "worker_id": worker_id,
            "vuln_id": vuln_id,
            "title": title,
            "description": description,
            "severity": severity or "Unknown",
            "file_path": file_path or "",
            "line_start": line_start,
            "line_end": line_end,
            "vuln_type": vuln_type or "unknown",
            "raw_json": json.dumps(
                {
                    "vuln_id": vuln_id,
                    "title": title,
                    "severity": severity,
                    "file_path": file_path,
                    "lines": lines_str,
                    "vuln_type": vuln_type,
                    "description": description,
                },
                ensure_ascii=False,
            ),
        }
        results.append(record)

    return results


def _extract_bullet(text: str, field_name: str) -> Optional[str]:
    """Extract the value of a `- **Field**: value` bullet."""
    # Match lines like: - **Severity**: High
    pattern = re.compile(
        rf"^-\s+\*\*{re.escape(field_name)}\*\*\s*:\s*(.+)$",
        re.MULTILINE | re.IGNORECASE,
    )
    match = pattern.search(text)
    if match:
        return match.group(1).strip()
    return None


def _parse_lines(lines_str: Optional[str]) -> tuple[Optional[int], Optional[int]]:
    """Parse a '45-52' or '45' string into (start, end)."""
    if not lines_str:
        return None, None
    # Remove any surrounding markdown formatting or whitespace
    cleaned = lines_str.strip().strip("`").strip()
    if "-" in cleaned:
        parts = cleaned.split("-", 1)
        try:
            start = int(parts[0].strip())
            end = int(parts[1].strip())
            return start, end
        except (ValueError, IndexError):
            return None, None
    else:
        try:
            val = int(cleaned)
            return val, val
        except ValueError:
            return None, None


def _extract_description(body: str) -> Optional[str]:
    """Return text after the bullet list as the description."""
    lines = body.splitlines()
    # Find the first line that is NOT a bullet and not empty
    desc_lines: List[str] = []
    in_bullets = True
    for line in lines:
        stripped = line.strip()
        if in_bullets:
            if stripped.startswith("-") or stripped.startswith("*"):
                continue
            if stripped == "":
                continue
            in_bullets = False
        desc_lines.append(line)

    description = "\n".join(desc_lines).strip()
    return description if description else None
