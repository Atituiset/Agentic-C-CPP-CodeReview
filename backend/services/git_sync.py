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


def get_changes_since(repo_path: str = ".", base_commit: Optional[str] = None) -> dict:
    """Get changes between base_commit and HEAD.

    Returns:
        {
            "added_files": int,
            "modified_files": int,
            "deleted_files": int,
            "changed_lines": int,
            "added_file_list": [str],
            "modified_file_list": [str],
            "deleted_file_list": [str],
        }
    """
    if not base_commit:
        return {
            "added_files": 0,
            "modified_files": 0,
            "deleted_files": 0,
            "changed_lines": 0,
            "added_file_list": [],
            "modified_file_list": [],
            "deleted_file_list": [],
        }

    try:
        # Get changed files with status (A=added, M=modified, D=deleted)
        output = _run_git(
            ["diff", "--name-status", f"{base_commit}..HEAD"],
            cwd=repo_path,
        )

        added = []
        modified = []
        deleted = []
        for line in output.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            status, filepath = parts[0], parts[1]
            if status.startswith("A"):
                added.append(filepath)
            elif status.startswith("M"):
                modified.append(filepath)
            elif status.startswith("D"):
                deleted.append(filepath)

        # Get changed line count (insertions + deletions)
        stat_output = _run_git(
            ["diff", "--stat", f"{base_commit}..HEAD"],
            cwd=repo_path,
        )
        changed_lines = 0
        for line in stat_output.strip().split("\n"):
            # Parse lines like: "file.c | 10 ++++++-----"
            if "|" in line and ("+" in line or "-" in line):
                # Extract numbers from the end
                parts = line.rsplit("|", 1)
                if len(parts) == 2:
                    stat_part = parts[1].strip()
                    # Count + and - symbols
                    changed_lines += stat_part.count("+") + stat_part.count("-")

        return {
            "added_files": len(added),
            "modified_files": len(modified),
            "deleted_files": len(deleted),
            "changed_lines": changed_lines,
            "added_file_list": added,
            "modified_file_list": modified,
            "deleted_file_list": deleted,
        }
    except subprocess.CalledProcessError:
        return {
            "added_files": 0,
            "modified_files": 0,
            "deleted_files": 0,
            "changed_lines": 0,
            "added_file_list": [],
            "modified_file_list": [],
            "deleted_file_list": [],
        }


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
    """Get C/C++ files changed between base_commit and HEAD.

    Used by orchestrator for diff mode.
    """
    try:
        output = _run_git(
            ["diff", "--diff-filter=AM", "--name-only", f"{base_commit}..HEAD"],
            cwd=repo_path,
        )
        files = [line.strip() for line in output.strip().split("\n") if line.strip()]
        return [f for f in files if f.endswith(CPP_EXTENSIONS)]
    except subprocess.CalledProcessError:
        return []


def get_file_diff(repo_path: str, base_commit: str, file_path: str) -> str:
    """Get diff content for a single file between base_commit and HEAD."""
    try:
        return _run_git(
            ["diff", f"{base_commit}..HEAD", "--", file_path],
            cwd=repo_path,
        )
    except subprocess.CalledProcessError:
        return ""
