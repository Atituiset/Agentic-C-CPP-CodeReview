"""Git utilities for worker node — file discovery and change tracking.

This module is the node-level counterpart to backend/services/git_sync.py.
Each worker node discovers its own local files and computes its own git stats.
"""
import subprocess
from pathlib import Path
from typing import List, Optional

# File extensions considered as C/C++ source files
CPP_EXTENSIONS = (".c", ".cc", ".cpp", ".h", ".hpp")


def _run_git(args: List[str], cwd: str = ".", timeout: int = 30) -> str:
    """Run a git command and return stdout."""
    result = subprocess.run(
        ["git", "-C", str(cwd)] + args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=True,
    )
    return result.stdout


def get_head_commit(repo_path: str = ".") -> Optional[str]:
    """Get the current HEAD commit hash."""
    try:
        output = _run_git(["rev-parse", "HEAD"], cwd=repo_path)
        return output.strip()
    except subprocess.CalledProcessError:
        return None


def get_all_cpp_files(repo_path: str = ".") -> List[str]:
    """Recursively find all C/C++ source files in the repository.

    Returns relative paths from repo_path.
    """
    repo = Path(repo_path).resolve()
    files = []
    for ext in CPP_EXTENSIONS:
        for p in repo.rglob(f"*{ext}"):
            # Skip common build/output directories
            parts = p.relative_to(repo).parts
            if any(part.startswith(".") for part in parts):
                continue
            if any(part in ("build", "dist", "node_modules", "venv", ".venv", "__pycache__")
                   for part in parts):
                continue
            files.append(str(p.relative_to(repo)))
    return sorted(set(files))


def get_cpp_file_count(repo_path: str = ".") -> int:
    """Count C/C++ source files in the repository."""
    return len(get_all_cpp_files(repo_path))


def get_changed_cpp_files(repo_path: str = ".", base_commit: str = "") -> List[str]:
    """Get C/C++ files changed between base_commit and HEAD."""
    try:
        output = _run_git(
            ["diff", "--diff-filter=AM", "--name-only", f"{base_commit}..HEAD"],
            cwd=repo_path,
        )
        files = [line.strip() for line in output.strip().split("\n") if line.strip()]
        return [f for f in files if f.endswith(CPP_EXTENSIONS)]
    except subprocess.CalledProcessError:
        return []
