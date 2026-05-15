import asyncio
import os
import re
import subprocess
import sys
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


# Cache default model to avoid repeated detection
_default_model: str | None = None


def detect_default_model() -> str | None:
    """Detect user's default opencode model and return full provider/model path."""
    global _default_model
    if _default_model is not None:
        return _default_model
    try:
        # Quick detection: run nga hello and grab the model line (first 2 lines).
        result = subprocess.run(
            ["timeout", "5", "bash", "-c", 'nga run "hello" 2>&1 | head -2'],
            capture_output=True,
            text=True,
            timeout=7,
        )
        model_name = None
        for line in result.stdout.splitlines():
            match = re.search(r">\s+\w+\s+·\s+(.+)", line)
            if match:
                model_name = match.group(1).strip().rstrip("/")
                break

        if not model_name:
            return None

        # Find the full provider/model path from nga models output.
        models_result = subprocess.run(
            ["timeout", "5", "nga", "models"],
            capture_output=True,
            text=True,
            timeout=7,
        )
        for model_line in models_result.stdout.splitlines():
            if model_line.endswith(f"/{model_name}"):
                _default_model = model_line.strip()
                return _default_model

        # Fallback: infer provider from auth.json.
        auth_path = Path.home() / ".local" / "share" / "opencode" / "auth.json"
        if auth_path.exists():
            import json
            auth = json.loads(auth_path.read_text())
            for provider in auth.keys():
                if provider.lower() in model_name.lower():
                    _default_model = f"{provider}/{model_name}"
                    return _default_model

        _default_model = model_name
        return model_name
    except Exception:
        pass
    return None


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
    # Use sys.executable so orchestrator runs in the same Python environment
    # (backend/.venv) where redis-py is installed.
    cmd = [sys.executable, script]

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
    env["WORKER_ID"] = "local"
    env["JOB_ID"] = job_id
    env["BACKEND_URL"] = os.environ.get("BACKEND_URL", "http://localhost:8000")
    model = detect_default_model()
    if model:
        env["OPENCODE_MODEL"] = model

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
        cwd=repo_path,
    )
    return proc
