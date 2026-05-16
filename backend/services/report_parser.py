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

    Supports two formats:
    1. Native VULN format:
       ## VULN-001: Title of vulnerability
       - **Severity**: High
       - **File**: src/auth/session.cpp
       - **Lines**: 45-52
       - **Type**: sast_semgrep

    2. NGA review output format:
       ### Critical Issues
       **1. Use-After-Free (line 19)**
       Description text here...
    """
    if not markdown or not markdown.strip():
        return []

    # Try native VULN format first
    results = _parse_vuln_format(markdown, job_id, task_id, worker_id)
    if results:
        return results

    # Fallback to NGA review format
    return _parse_nga_format(markdown, job_id, task_id, worker_id)


def _parse_vuln_format(
    markdown: str,
    job_id: str,
    task_id: Optional[str] = None,
    worker_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Parse the native ## VULN-XXX: format."""
    pattern = re.compile(r"(?=^##\s+VULN-\d+:\s+.+$)", re.MULTILINE)
    chunks = pattern.split(markdown)

    results: List[Dict[str, Any]] = []

    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue

        header_match = re.match(r"^##\s+(VULN-\d+):\s+(.+)$", chunk, re.MULTILINE)
        if not header_match:
            continue

        vuln_id = header_match.group(1).strip()
        title = header_match.group(2).strip()

        body = re.sub(r"^##\s+.*$", "", chunk, count=1, flags=re.MULTILINE).strip()

        severity = _extract_bullet(body, "Severity")
        file_path = _extract_bullet(body, "File")
        lines_str = _extract_bullet(body, "Lines")
        vuln_type = _extract_bullet(body, "Type")

        line_start, line_end = _parse_lines(lines_str)
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


def _parse_nga_format(
    markdown: str,
    job_id: str,
    task_id: Optional[str] = None,
    worker_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Parse NGA review output format. Handles multiple nga output variants."""
    results: List[Dict[str, Any]] = []

    # Extract file path from report header
    file_path = ""
    file_match = re.search(r"\*\*\s*(?:文件|File)\s*\*\*\s*:\s*`?([^`\n]+)`?", markdown)
    if file_match:
        file_path = file_match.group(1).strip()

    severity_map = {
        "critical": "Critical",
        "high": "High",
        "moderate": "Medium",
        "medium": "Medium",
        "low": "Low",
        "design": "Low",
        "info": "Low",
        "informational": "Low",
    }

    # Build a map of position -> severity by scanning for section headings
    severity_at_pos: dict[int, str] = {}

    # Pattern A: ## Severity or ### Severity Issues (markdown headings)
    heading_pattern = re.compile(
        rf"^#{{2,3}}\s+(critical|high|moderate|medium|low|design|info|informational)"
        rf"(?:\s+(?:issues?|findings?|vulnerabilities?|bugs?))?[^\n]*$",
        re.MULTILINE | re.IGNORECASE,
    )
    for m in heading_pattern.finditer(markdown):
        severity_at_pos[m.start()] = severity_map.get(m.group(1).lower(), "Medium")

    # Pattern B: **Severity Issues:** or **Critical Bugs:** (bold text headings)
    bold_heading_pattern = re.compile(
        rf"^\*\*\s*(critical|high|moderate|medium|low|design|info|informational)\s+"
        rf"(issues?|findings?|vulnerabilities?|bugs?|concerns?)\s*:\s*\*\*$",
        re.MULTILINE | re.IGNORECASE,
    )
    for m in bold_heading_pattern.finditer(markdown):
        severity_at_pos[m.start()] = severity_map.get(m.group(1).lower(), "Medium")

    if not severity_at_pos:
        return results

    # Skip "Thinking:" sections - only parse from first severity heading onward
    parse_start = min(severity_at_pos.keys())

    # Finding patterns - try multiple formats (no trailing \n required)
    finding_patterns = [
        # **1. Title (line 19)** or **1. Title**
        re.compile(
            r"^\*\*\s*(\d+)\.\s+(.+?)\s*\*\*\s*(?:\(([^)]+)\))?",
            re.MULTILINE,
        ),
        # 1. **Title (line 19):** description  or  1. **Title:** description
        re.compile(
            r"^(\d+)\.\s+\*\*\s*(.+?)\s*\*\*\s*:?\s*(?:\(([^)]+)\))?",
            re.MULTILINE,
        ),
    ]

    vuln_counter = 1

    # Collect all findings with their positions
    all_findings: list[tuple[int, int, str, str, str]] = []
    # (start_pos, number, title, line_hint, full_match_end)

    parse_text = markdown[parse_start:]
    parse_offset = parse_start

    for pattern in finding_patterns:
        for m in pattern.finditer(parse_text):
            num = int(m.group(1))
            title = m.group(2).strip()
            line_hint = m.group(3) or ""
            # Skip if this looks like a file path header
            if title.startswith("文件") or title.startswith("File"):
                continue
            all_findings.append((parse_offset + m.start(), num, title, line_hint, parse_offset + m.end()))

    # Deduplicate by position (keep first match)
    seen_pos = set()
    unique_findings = []
    for f in sorted(all_findings, key=lambda x: x[0]):
        if f[0] not in seen_pos:
            seen_pos.add(f[0])
            unique_findings.append(f)

    for i, (pos, num, title, line_hint, match_end) in enumerate(unique_findings):
        # Determine severity from nearest preceding section heading
        severity = "Medium"
        nearest_pos = -1
        for spos, sev in severity_at_pos.items():
            if spos < pos and spos > nearest_pos:
                nearest_pos = spos
                severity = sev

        # Extract description: text after this finding until next finding or section
        desc_start = match_end
        desc_end = len(markdown)
        if i + 1 < len(unique_findings):
            desc_end = unique_findings[i + 1][0]
        # Also truncate at next major heading
        next_heading = re.search(r"\n#+\s+", markdown[desc_start:desc_end])
        if next_heading:
            desc_end = desc_start + next_heading.start()

        description = markdown[desc_start:desc_end].strip()
        description = re.sub(r"^\s*\n+", "", description)
        description = re.split(r"\n#+\s", description)[0].strip()

        line_start, line_end = _parse_lines(line_hint)
        if line_start is None:
            # Try formats: (line 19), (L19), (L19-20), (lines 19-20)
            for line_pat in [
                r"\(line[s]?\s+(\d+)(?:\s*[-,]\s*(\d+))?\)",
                r"\(L(\d+)(?:\s*[-,]\s*(\d+))?\)",
                r"\((\d+)(?:\s*[-,]\s*(\d+))?\)",
            ]:
                m = re.search(line_pat, title, re.IGNORECASE)
                if m:
                    line_start = int(m.group(1))
                    line_end = int(m.group(2)) if m.group(2) else line_start
                    break

        vuln_id = f"VULN-{vuln_counter:04d}"
        vuln_counter += 1

        record: Dict[str, Any] = {
            "job_id": job_id,
            "task_id": task_id,
            "worker_id": worker_id,
            "vuln_id": vuln_id,
            "title": title,
            "description": description if description else None,
            "severity": severity,
            "file_path": file_path,
            "line_start": line_start,
            "line_end": line_end,
            "vuln_type": "nga_semantic",
            "raw_json": json.dumps(
                {
                    "vuln_id": vuln_id,
                    "title": title,
                    "severity": severity,
                    "file_path": file_path,
                    "lines": line_hint,
                    "vuln_type": "nga_semantic",
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
    """Parse a '45-52', '45', 'line 37', or 'L43-45' string into (start, end)."""
    if not lines_str:
        return None, None
    # Remove any surrounding markdown formatting or whitespace
    cleaned = lines_str.strip().strip("`").strip()
    # Try to extract numbers from formats like "line 37", "L43-45", "lines 19-20"
    # Pattern: optional prefix, then number, optional separator+second number
    m = re.search(r"(?:^|[^0-9])(\d+)(?:\s*[-,]\s*(\d+))?", cleaned)
    if m:
        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else start
        return start, end
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
