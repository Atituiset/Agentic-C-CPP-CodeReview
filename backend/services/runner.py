import asyncio
import os
from pathlib import Path


def find_orchestrator_script() -> str:
    """Find the orchestrator script path."""
    candidates = [
        "worker/orchestrator.py",
        "../worker/orchestrator.py",
        "./worker/orchestrator.py",
    ]
    for c in candidates:
        if Path(c).exists():
            return str(Path(c).resolve())
    raise FileNotFoundError("worker/orchestrator.py not found")


async def run_orchestrator(
    job_id: str,
    repo_path: str,
    mode: str,
    target_commit: str | None,
    file_paths: list[str] | None,
    report_dir: str,
    web_port: int = 3000,
) -> asyncio.subprocess.Process:
    """Spawn orchestrator subprocess for a job."""
    script = find_orchestrator_script()
    cmd = ["python3", script]

    if mode == "diff" and target_commit:
        cmd.extend(["--diff", target_commit, "--repo", repo_path])
    elif mode == "files" and file_paths:
        cmd.extend(["--files"] + file_paths)

    cmd.extend([
        "--web-port", str(web_port),
        "-c", "3",
    ])

    env = os.environ.copy()
    env["REPORT_DIR"] = report_dir

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
        cwd=repo_path,
    )
    return proc
