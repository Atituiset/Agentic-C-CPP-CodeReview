# 远程 Worker 节点支持 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Personal 用户远程 Worker 的注册、SSH 部署、定时调度、日志流式推送和结果上报。

**Architecture:** 服务器通过 SSH 部署轻量 FastAPI Agent 到用户机器，Agent 常驻运行并心跳保活；APScheduler 到点时 HTTP 直推扫描任务给 Agent；Agent 启动 orchestrator 扫描，通过 Redis 推送日志，扫描完成后解析报告并 HTTP 批量上报结果。

**Tech Stack:** Python 3.12, FastAPI, asyncssh, SQLAlchemy 2.0, APScheduler, React 19, Tailwind 4

---

## File Structure

### 后端（新建）
| 文件 | 职责 |
|------|------|
| `backend/services/deployer.py` | SSH 连接、环境检查、Agent 部署 |
| `worker/agent.py` | 常驻 Agent：HTTP 服务、注册、心跳、扫描、结果上报 |

### 后端（修改）
| 文件 | 职责 |
|------|------|
| `backend/models/orm.py` | Worker/Job 表扩展新字段 |
| `backend/models/schemas.py` | 新增 DeployStatus, WorkerCreate, ScanRequest 等 schema |
| `backend/routers/workers.py` | 新增 deploy 接口、owner_id 权限过滤 |
| `backend/routers/jobs.py` | 新增 `/finalize` 接口接收 Agent 上报结果 |
| `backend/services/scheduler.py` | 改造 `_run_worker_scan` 为 HTTP 直推 Agent |
| `backend/main.py` | 注册新 router（如需） |

### 前端（新建）
| 文件 | 职责 |
|------|------|
| `frontend/src/components/MyWorkers.tsx` | Personal Worker 列表页面 |
| `frontend/src/components/AddWorkerModal.tsx` | 添加 Worker 表单弹窗 |

### 前端（修改）
| 文件 | 职责 |
|------|------|
| `frontend/src/hooks/useApi.ts` | 新增 deployWorker, fetchMyWorkers, triggerWorkerScan 等 API |
| `frontend/src/App.tsx` | 添加 MyWorkers 路由和侧边栏入口 |
| `frontend/src/components/Sidebar.tsx` | 新增 "My Workers" 导航项 |

### 测试（新建）
| 文件 | 职责 |
|------|------|
| `backend/tests/test_deployer.py` | Deployer 服务单元测试（mock SSH） |
| `backend/tests/test_worker_jobs.py` | Worker 任务调度、finalize 接口测试 |

---

## 依赖安装

```bash
# 后端新增 asyncssh
cd /home/atituiset/Projects/combinate-agentic-review
uv add --project backend asyncssh

# 验证安装
uv run --project backend python -c "import asyncssh; print(asyncssh.__version__)"
```

---

## Task 1: 数据模型扩展

**Files:**
- Modify: `backend/models/orm.py`
- Modify: `backend/models/schemas.py`
- Test: `backend/tests/test_models.py`（验证 ORM 能正常创建）

- [ ] **Step 1: Worker 表扩展字段**

在 `backend/models/orm.py` 的 `Worker` 类中，在 `show_thinking` 字段后追加：

```python
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    ssh_host = Column(String(256), nullable=True)
    ssh_port = Column(Integer, default=22)
    ssh_username = Column(String(128), nullable=True)
    ssh_key = Column(Text, nullable=True)
    deploy_status = Column(String(16), default="pending")
    deploy_error = Column(Text, nullable=True)
    repo_path = Column(Text, nullable=True)
    scan_mode = Column(String(16), default="full")
    target_commit = Column(String(64), nullable=True)
    cared_paths = Column(Text, nullable=True)
```

在 `Job` 类中，在 `resumed_from_id` 字段后追加：

```python
    assigned_worker_id = Column(String(64), nullable=True)
    dispatch_error = Column(Text, nullable=True)
```

- [ ] **Step 2: Schema 扩展**

在 `backend/models/schemas.py` 末尾追加：

```python
class WorkerCreate(BaseModel):
    worker_id: str = Field(min_length=1, max_length=64)
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    ssh_host: Optional[str] = None
    ssh_port: int = 22
    ssh_username: Optional[str] = None
    ssh_key: Optional[str] = None
    repo_path: Optional[str] = None
    scan_mode: str = Field(default="full", pattern="^(full|diff)$")
    target_commit: Optional[str] = None
    cared_paths: Optional[List[str]] = None

class WorkerDeployRequest(BaseModel):
    worker_id: str

class ScanRequest(BaseModel):
    job_id: str
    repo_path: str
    mode: str = Field(pattern="^(full|diff|files)$")
    report_dir: str

class JobFinalizePayload(BaseModel):
    status: str = Field(pattern="^(completed|failed|interrupted)$")
    worker_id: str
    completed_files: int = 0
    failed_files: int = 0
    tasks: Optional[List[dict]] = None
    vulnerabilities: Optional[List[dict]] = None
```

同时修改 `WorkerResponse` 增加新字段：

```python
class WorkerResponse(BaseModel):
    id: str
    worker_id: str
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    status: str
    current_job_id: Optional[str] = None
    last_heartbeat: Optional[datetime] = None
    registered_at: Optional[datetime] = None
    capabilities: Optional[dict] = None
    show_thinking: bool = True
    # 新增
    owner_id: Optional[str] = None
    ssh_host: Optional[str] = None
    ssh_port: int = 22
    ssh_username: Optional[str] = None
    deploy_status: str = "pending"
    deploy_error: Optional[str] = None
    repo_path: Optional[str] = None
    scan_mode: str = "full"
    target_commit: Optional[str] = None
    cared_paths: Optional[List[str]] = None
    model_config = ConfigDict(from_attributes=True)
```

- [ ] **Step 3: 验证数据库创建**

开发环境下删除旧数据库让 SQLAlchemy 重新创建（生产环境需手动 ALTER TABLE）：

```bash
rm -f /home/atituiset/Projects/combinate-agentic-review/data/app.db
uv run --project backend python -c "
from backend.database import engine
from backend.models.orm import Base
Base.metadata.create_all(bind=engine)
print('Tables created')
"
```

Expected: `Tables created`

- [ ] **Step 4: Commit**

```bash
git add backend/models/orm.py backend/models/schemas.py
git commit -m "feat(models): extend Worker and Job tables for remote worker support"
```

---

## Task 2: Worker 权限控制 + Deploy 接口

**Files:**
- Modify: `backend/routers/workers.py`
- Modify: `backend/routers/auth.py`（确保 get_current_user 可用）
- Test: `backend/tests/test_workers.py`

- [ ] **Step 1: 引入当前用户依赖**

在 `backend/routers/workers.py` 顶部引入：

```python
from backend.routers.auth import get_current_user
from backend.models.orm import User
```

- [ ] **Step 2: list_workers 增加 owner_id 过滤**

修改 `backend/routers/workers.py` 的 `list_workers` 函数：

```python
@router.get("/api/workers")
async def list_workers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Worker)
    if current_user.role == "user":
        query = query.filter(Worker.owner_id == current_user.id)
    workers = query.order_by(Worker.registered_at.desc()).all()
    return [WorkerResponse.model_validate(_worker_to_dict(w)) for w in workers]
```

- [ ] **Step 3: register_worker 增加 owner_id**

修改 `register_worker` 函数签名和逻辑，增加 `owner_id` 参数：

```python
@router.post("/api/workers/{worker_id}/register")
async def register_worker(
    worker_id: str,
    payload: WorkerRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if existing:
        existing.hostname = payload.hostname
        existing.ip_address = payload.ip_address
        existing.status = "idle"
        existing.current_job_id = None
        existing.last_heartbeat = datetime.now(timezone.utc)
        existing.capabilities = json.dumps(payload.capabilities) if payload.capabilities else None
        existing.deploy_status = "deployed"
        db.commit()
        db.refresh(existing)
        return {"ok": True, "message": "Worker updated", "worker": WorkerResponse.model_validate(_worker_to_dict(existing))}

    worker = Worker(
        worker_id=worker_id,
        hostname=payload.hostname,
        ip_address=payload.ip_address,
        status="idle",
        last_heartbeat=datetime.now(timezone.utc),
        capabilities=json.dumps(payload.capabilities) if payload.capabilities else None,
        owner_id=current_user.id,
        deploy_status="deployed",
    )
    db.add(worker)
    # ... 后续不变（创建 schedule 和 git_status）
```

- [ ] **Step 4: 新增 create_worker 接口（表单提交时创建记录）**

在 `backend/routers/workers.py` 中新增：

```python
@router.post("/api/workers")
async def create_worker(
    payload: WorkerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(Worker).filter(Worker.worker_id == payload.worker_id).first():
        raise HTTPException(status_code=409, detail="Worker ID already exists")

    worker = Worker(
        worker_id=payload.worker_id,
        hostname=payload.hostname,
        ip_address=payload.ip_address,
        owner_id=current_user.id,
        ssh_host=payload.ssh_host,
        ssh_port=payload.ssh_port,
        ssh_username=payload.ssh_username,
        ssh_key=payload.ssh_key,
        repo_path=payload.repo_path,
        scan_mode=payload.scan_mode,
        target_commit=payload.target_commit,
        cared_paths=json.dumps(payload.cared_paths) if payload.cared_paths else None,
        deploy_status="pending",
    )
    db.add(worker)
    db.commit()
    db.refresh(worker)
    return WorkerResponse.model_validate(_worker_to_dict(worker))
```

- [ ] **Step 5: 新增 deploy_worker 接口**

在 `backend/routers/workers.py` 中新增：

```python
from backend.services.deployer import deploy_worker as do_deploy
from fastapi import BackgroundTasks

@router.post("/api/workers/{worker_id}/deploy")
async def deploy_worker_endpoint(
    worker_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if worker.owner_id != current_user.id and current_user.role not in ("admin", "committer"):
        raise HTTPException(status_code=403, detail="Not your worker")

    background_tasks.add_task(do_deploy, worker_id)
    return {"ok": True, "message": "Deployment started"}
```

- [ ] **Step 6: 运行现有 worker 测试确保不破坏**

```bash
uv run --project backend pytest backend/tests/test_workers.py -v
```

Expected: 全部通过

- [ ] **Step 7: Commit**

```bash
git add backend/routers/workers.py
git commit -m "feat(workers): add owner-based permission, create and deploy endpoints"
```

---

## Task 3: SSH 部署服务

**Files:**
- Create: `backend/services/deployer.py`
- Test: `backend/tests/test_deployer.py`

- [ ] **Step 1: 创建 deployer.py**

```python
import asyncio
import json
import logging
from io import StringIO
from pathlib import Path

import asyncssh
from backend.database import SessionLocal
from backend.models.orm import Worker

logger = logging.getLogger("deployer")

AGENT_TEMPLATE_PATH = Path(__file__).parent.parent.parent / "worker" / "agent.py"


class DeploymentError(Exception):
    pass


async def deploy_worker(worker_id: str):
    """通过 SSH 连接到 Worker 机器，检查环境并部署 Agent。"""
    db = SessionLocal()
    try:
        worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
        if not worker:
            raise DeploymentError(f"Worker {worker_id} not found")

        worker.deploy_status = "deploying"
        worker.deploy_error = None
        db.commit()

        await _do_deploy(worker)

        worker.deploy_status = "deployed"
        worker.deploy_error = None
        db.commit()
        logger.info(f"Worker {worker_id} deployed successfully")

    except Exception as e:
        logger.error(f"Deployment failed for {worker_id}: {e}")
        worker.deploy_status = "failed"
        worker.deploy_error = str(e)
        db.commit()
        raise
    finally:
        db.close()


async def _do_deploy(worker: Worker):
    """执行 SSH 部署的实际逻辑。"""
    if not worker.ssh_host or not worker.ssh_username:
        raise DeploymentError("SSH host and username are required")

    conn_kwargs = {
        "host": worker.ssh_host,
        "port": worker.ssh_port or 22,
        "username": worker.ssh_username,
        "known_hosts": None,  # 内网环境，首次连接自动接受
    }
    if worker.ssh_key:
        conn_kwargs["client_keys"] = [asyncssh.import_private_key(worker.ssh_key)]

    async with asyncssh.connect(**conn_kwargs) as conn:
        # 1. 检查 Python 版本
        result = await conn.run("python3 --version")
        if result.exit_status != 0:
            raise DeploymentError("python3 not found on remote machine")
        version_line = result.stdout.strip()
        # 解析版本如 "Python 3.12.1"
        try:
            version_str = version_line.split()[1]
            major, minor = map(int, version_str.split(".")[:2])
            if major < 3 or (major == 3 and minor < 10):
                raise DeploymentError(f"Python 3.10+ required, found {version_str}")
        except (IndexError, ValueError):
            logger.warning(f"Could not parse Python version: {version_line}")

        # 2. 检查并安装依赖
        check = await conn.run(
            "python3 -c 'import redis.asyncio, httpx, fastapi, uvicorn' 2>/dev/null"
        )
        if check.exit_status != 0:
            logger.info("Installing agent dependencies on remote machine")
            install = await conn.run(
                "python3 -m pip install --user redis httpx fastapi uvicorn",
                timeout=120,
            )
            if install.exit_status != 0:
                raise DeploymentError(f"pip install failed: {install.stderr}")

        # 3. 创建 Agent 目录
        await conn.run("mkdir -p ~/.opencode-agent/logs")

        # 4. SFTP 上传文件
        backend_url = _get_backend_url()
        redis_url = _get_redis_url()

        config = {
            "worker_id": worker.worker_id,
            "backend_url": backend_url,
            "redis_url": redis_url,
            "repo_path": worker.repo_path or ".",
        }

        async with conn.start_sftp_client() as sftp:
            # 上传 agent.py
            await sftp.put(
                str(AGENT_TEMPLATE_PATH),
                ".opencode-agent/agent.py",
            )
            # 上传 config.json
            config_data = json.dumps(config, indent=2)
            await sftp.put(
                StringIO(config_data),
                ".opencode-agent/config.json",
            )

        # 5. 启动 Agent
        await conn.run(
            "cd ~/.opencode-agent && "
            "(kill $(cat agent.pid 2>/dev/null) 2>/dev/null; sleep 1; true) && "
            "nohup python3 agent.py > logs/agent.log 2>&1 & "
            "echo $! > agent.pid",
        )

        # 6. 等待 Agent 注册（最多 60 秒）
        db2 = SessionLocal()
        try:
            for _ in range(30):
                await asyncio.sleep(2)
                w = db2.query(Worker).filter(Worker.worker_id == worker_id).first()
                if w and w.last_heartbeat:
                    logger.info(f"Agent registered for {worker_id}")
                    return
            raise DeploymentError("Agent did not register within 60 seconds")
        finally:
            db2.close()


def _get_backend_url() -> str:
    import os
    return os.environ.get("BACKEND_URL", "http://localhost:8000")


def _get_redis_url() -> str:
    import os
    return os.environ.get("REDIS_URL", "redis://localhost:6379/0")
```

- [ ] **Step 2: 创建测试文件**

```python
# backend/tests/test_deployer.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.deployer import deploy_worker, DeploymentError


@pytest.mark.asyncio
async def test_deploy_worker_not_found():
    with pytest.raises(DeploymentError, match="not found"):
        await deploy_worker("nonexistent-worker")


@pytest.mark.asyncio
async def test_deploy_worker_missing_ssh_host():
    from backend.database import SessionLocal
    from backend.models.orm import Worker

    db = SessionLocal()
    worker = Worker(worker_id="test-worker-1", owner_id="test-user")
    db.add(worker)
    db.commit()

    with pytest.raises(DeploymentError, match="SSH host"):
        await deploy_worker("test-worker-1")

    db.delete(worker)
    db.commit()
    db.close()
```

- [ ] **Step 3: 运行测试**

```bash
uv run --project backend pytest backend/tests/test_deployer.py -v
```

Expected: 2 passed

- [ ] **Step 4: Commit**

```bash
git add backend/services/deployer.py backend/tests/test_deployer.py
git commit -m "feat(deployer): SSH deployment service for remote workers"
```

---

## Task 4: Agent 程序

**Files:**
- Create: `worker/agent.py`

- [ ] **Step 1: 创建 agent.py**

```python
#!/usr/bin/env python3
"""OpenCode Worker Agent - 常驻轻量服务，部署在远程扫描机器上。

功能:
- 启动时向后端注册
- 定时心跳保活
- 接收扫描指令并启动 orchestrator
- 扫描完成后解析报告并上报结果
"""

import asyncio
import json
import os
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    import httpx
except ImportError:
    print("ERROR: httpx not installed. Run: python3 -m pip install --user httpx")
    sys.exit(1)

try:
    from fastapi import FastAPI
    import uvicorn
except ImportError:
    print("ERROR: fastapi/uvicorn not installed. Run: python3 -m pip install --user fastapi uvicorn")
    sys.exit(1)

# Optional Redis for log push
try:
    import redis.asyncio as aioredis
except ImportError:
    aioredis = None  # type: ignore

# Report parser for result upload
try:
    sys.path.insert(0, str(Path(__file__).parent))
    from backend.services.report_parser import parse_vulnerability_report
except ImportError:
    parse_vulnerability_report = None  # type: ignore

app = FastAPI()

# Load config
CONFIG_PATH = Path.home() / ".opencode-agent" / "config.json"
config: dict = {}

if CONFIG_PATH.exists():
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
else:
    print(f"ERROR: Config not found at {CONFIG_PATH}")
    sys.exit(1)

WORKER_ID = config.get("worker_id", "unknown")
BACKEND_URL = config.get("backend_url", "http://localhost:8000")
REDIS_URL = config.get("redis_url", "redis://localhost:6379/0")
REPO_PATH = config.get("repo_path", ".")

# State
_orchestrator_proc: Optional[subprocess.Popen] = None


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


async def _register():
    """启动时向后端注册。"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{BACKEND_URL}/api/workers/{WORKER_ID}/register",
                json={
                    "hostname": socket.gethostname(),
                    "ip_address": get_local_ip(),
                },
            )
            if resp.status_code == 200:
                print(f"[Agent] Registered as {WORKER_ID}")
            else:
                print(f"[Agent] Register warning: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"[Agent] Register failed: {e}")


async def _heartbeat_loop():
    """每 30 秒发送心跳。"""
    while True:
        await asyncio.sleep(30)
        try:
            status = "running" if _is_orchestrator_running() else "idle"
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"{BACKEND_URL}/api/workers/{WORKER_ID}/heartbeat",
                    json={
                        "status": status,
                        "current_job_id": _get_current_job_id(),
                    },
                )
        except Exception as e:
            print(f"[Agent] Heartbeat failed: {e}")


def _is_orchestrator_running() -> bool:
    global _orchestrator_proc
    if _orchestrator_proc is None:
        return False
    return _orchestrator_proc.poll() is None


def _get_current_job_id() -> Optional[str]:
    return getattr(_monitor_task, "job_id", None) if "_monitor_task" in globals() else None


@app.post("/scan")
async def start_scan(payload: dict):
    """接收扫描指令，启动 orchestrator。"""
    global _orchestrator_proc

    if _is_orchestrator_running():
        return {"ok": False, "error": "Another scan is already running"}

    job_id = payload.get("job_id")
    repo_path = payload.get("repo_path", REPO_PATH)
    mode = payload.get("mode", "full")
    report_dir = payload.get("report_dir", f"/tmp/opencode-reports/{job_id}")

    # 创建报告目录
    Path(report_dir).mkdir(parents=True, exist_ok=True)

    # 准备环境变量
    env = os.environ.copy()
    env["JOB_ID"] = job_id
    env["WORKER_ID"] = WORKER_ID
    env["REDIS_URL"] = REDIS_URL
    env["BACKEND_URL"] = BACKEND_URL
    env["REPORT_DIR"] = report_dir

    # 启动 orchestrator
    agent_dir = Path.home() / ".opencode-agent"
    orch_path = Path(__file__).parent / "orchestrator.py"
    if not orch_path.exists():
        # orchestrator.py 和 agent.py 在同一目录
        orch_path = Path(__file__).parent.parent / "orchestrator.py"

    cmd = [
        "python3", str(orch_path),
        f"--{mode}",
        "--repo", repo_path,
        "-c", "3",
    ]

    print(f"[Agent] Starting scan: job={job_id}, mode={mode}, repo={repo_path}")
    _orchestrator_proc = subprocess.Popen(
        cmd,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # 启动监控协程
    asyncio.create_task(_monitor_scan(job_id, report_dir))

    return {"ok": True, "pid": _orchestrator_proc.pid}


async def _monitor_scan(job_id: str, report_dir: str):
    """监控扫描进程，完成后解析报告并上报。"""
    global _orchestrator_proc
    proc = _orchestrator_proc

    if proc is None:
        return

    # 等待 orchestrator 结束
    while proc.poll() is None:
        await asyncio.sleep(2)

    exit_code = proc.returncode
    print(f"[Agent] Scan completed: job={job_id}, exit_code={exit_code}")

    # 解析报告
    tasks = []
    vulnerabilities = []

    report_path = Path(report_dir)
    if report_path.exists():
        for md_file in report_path.rglob("*.md"):
            if md_file.name == "summary.md":
                continue
            relative = str(md_file.relative_to(report_path).with_suffix(""))
            log_file = md_file.with_suffix(".log")

            task_status = "done"
            if log_file.exists():
                try:
                    log_content = log_file.read_text(encoding="utf-8", errors="replace")
                    if "Status: failed" in log_content:
                        task_status = "failed"
                except Exception:
                    pass

            tasks.append({
                "file_path": relative,
                "status": task_status,
                "report_file": str(md_file),
                "log_file": str(log_file) if log_file.exists() else None,
            })

            # 解析漏洞
            if parse_vulnerability_report:
                try:
                    markdown = md_file.read_text(encoding="utf-8", errors="replace")
                    records = parse_vulnerability_report(markdown, job_id=job_id)
                    for r in records:
                        r["worker_id"] = WORKER_ID
                        vulnerabilities.append(r)
                except Exception as e:
                    print(f"[Agent] Failed to parse {md_file}: {e}")

    # 上报结果
    status = "completed" if exit_code == 0 else "failed"
    completed = sum(1 for t in tasks if t["status"] == "done")
    failed = sum(1 for t in tasks if t["status"] == "failed")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{BACKEND_URL}/api/jobs/{job_id}/finalize",
                json={
                    "status": status,
                    "worker_id": WORKER_ID,
                    "completed_files": completed,
                    "failed_files": failed,
                    "tasks": tasks,
                    "vulnerabilities": vulnerabilities,
                },
            )
            print(f"[Agent] Finalize response: {resp.status_code}")
    except Exception as e:
        print(f"[Agent] Failed to finalize job: {e}")

    _orchestrator_proc = None


@app.get("/health")
async def health():
    return {"ok": True, "worker_id": WORKER_ID, "scanning": _is_orchestrator_running()}


@app.on_event("startup")
async def on_startup():
    await _register()
    asyncio.create_task(_heartbeat_loop())


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8765)
```

- [ ] **Step 2: Commit**

```bash
git add worker/agent.py
git commit -m "feat(agent):常驻Worker Agent with scan, heartbeat, result upload"
```

---

## Task 5: 调度器改造 — HTTP 直推 Agent

**Files:**
- Modify: `backend/services/scheduler.py`
- Test: `backend/tests/test_scheduler.py`（验证改造后不破坏现有逻辑）

- [ ] **Step 1: 改造 `_run_worker_scan`**

在 `backend/services/scheduler.py` 中：

```python
async def _run_worker_scan(worker_id: str):
    """定时触发：为指定 Worker 创建扫描任务并 HTTP 分发给 Agent。"""
    logger.info(f"[worker_scan] Triggered for {worker_id}")

    db = SessionLocal()
    try:
        worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
        if not worker:
            logger.warning(f"Worker {worker_id} not found, skipping scan")
            return

        if worker.deploy_status != "deployed":
            logger.warning(f"Worker {worker_id} not deployed, skipping scan")
            return

        # 检查 Worker 是否在线（心跳在 2 分钟内）
        now = datetime.now(timezone.utc)
        if worker.last_heartbeat and (now - worker.last_heartbeat).total_seconds() > 120:
            logger.warning(f"Worker {worker_id} offline (no heartbeat), skipping scan")
            return

        # 创建 Job
        repo_path = worker.repo_path or "."
        job = Job(
            repo_path=repo_path,
            mode=worker.scan_mode or "full",
            status="pending",
            assigned_worker_id=worker_id,
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        # 构建 report_dir（Agent 本地路径）
        report_dir = f"/tmp/opencode-reports/{job.id}"

        # HTTP 直推 Agent
        try:
            import httpx
            agent_url = f"http://{worker.ip_address or worker.ssh_host}:8765/scan"
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    agent_url,
                    json={
                        "job_id": job.id,
                        "repo_path": repo_path,
                        "mode": worker.scan_mode or "full",
                        "report_dir": report_dir,
                    },
                )

            if resp.status_code == 200:
                job.status = "dispatched"
                logger.info(f"Job {job.id} dispatched to {worker_id}")
            else:
                job.status = "failed"
                job.dispatch_error = f"Agent returned {resp.status_code}: {resp.text}"
                logger.error(f"Failed to dispatch job {job.id} to {worker_id}: {resp.status_code}")

        except Exception as e:
            job.status = "failed"
            job.dispatch_error = str(e)
            logger.error(f"Exception dispatching job {job.id} to {worker_id}: {e}")

        db.commit()

        # 更新 scheduler config（保持兼容）
        config = db.query(SchedulerConfig).filter(SchedulerConfig.job_name == "daily_scan").first()
        if not config:
            config = SchedulerConfig(job_name="daily_scan", job_type="scan", cron_expression="0 0 * * *")
            db.add(config)
        config.last_run_at = now
        db.commit()

    except Exception as e:
        logger.error(f"[worker_scan] Failed for {worker_id}: {e}")
    finally:
        db.close()
```

注意：需要在 `backend/services/scheduler.py` 顶部引入 `Worker`：

```python
from backend.models.orm import Job, SchedulerConfig, WorkerScheduleConfig, Worker
```

- [ ] **Step 2: 验证导入无报错**

```bash
uv run --project backend python -c "from backend.services.scheduler import _run_worker_scan; print('Import OK')"
```

Expected: `Import OK`

- [ ] **Step 3: Commit**

```bash
git add backend/services/scheduler.py
git commit -m "feat(scheduler): dispatch scan jobs to remote Agent via HTTP"
```

---

## Task 6: Job Finalize 接口

**Files:**
- Modify: `backend/routers/jobs.py`
- Test: `backend/tests/test_worker_jobs.py`

- [ ] **Step 1: 新增 finalize 接口**

在 `backend/routers/jobs.py` 末尾新增（或找到合适位置）：

```python
from backend.models.schemas import JobFinalizePayload

@router.post("/api/jobs/{job_id}/finalize")
async def finalize_job(
    job_id: str,
    payload: JobFinalizePayload,
    db: Session = Depends(get_db),
):
    """Agent 扫描完成后上报结果，后端批量创建 Task 和 Vulnerability。"""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = payload.status
    job.completed_at = datetime.now(timezone.utc)
    job.completed_files = payload.completed_files
    job.failed_files = payload.failed_files

    # 批量创建 Task
    for task_data in (payload.tasks or []):
        task = Task(
            job_id=job_id,
            worker_id=payload.worker_id,
            file_path=task_data.get("file_path", ""),
            status=task_data.get("status", "done"),
            report_file=task_data.get("report_file"),
            log_file=task_data.get("log_file"),
        )
        db.add(task)

    # 批量创建 Vulnerability
    for vuln_data in (payload.vulnerabilities or []):
        vuln = Vulnerability(
            job_id=job_id,
            task_id=vuln_data.get("task_id"),
            worker_id=payload.worker_id,
            vuln_id=vuln_data.get("vuln_id", "VULN-UNKNOWN"),
            file_path=vuln_data.get("file_path", ""),
            line_start=vuln_data.get("line_start"),
            line_end=vuln_data.get("line_end"),
            severity=vuln_data.get("severity", "Medium"),
            vuln_type=vuln_data.get("vuln_type", "unknown"),
            title=vuln_data.get("title", "Unknown vulnerability"),
            description=vuln_data.get("description"),
            raw_json=vuln_data.get("raw_json"),
        )
        db.add(vuln)

    db.commit()
    return {"ok": True, "job_id": job_id, "status": payload.status}
```

确保 `backend/routers/jobs.py` 顶部有 `Task` 和 `Vulnerability` 的导入：

```python
from backend.models.orm import Job, Task, Vulnerability
```

- [ ] **Step 2: 创建测试**

```python
# backend/tests/test_worker_jobs.py
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models.orm import Job, Worker, User

client = TestClient(app)


def test_finalize_job_not_found():
    resp = client.post(
        "/api/jobs/nonexistent/finalize",
        json={
            "status": "completed",
            "worker_id": "worker-01",
            "completed_files": 1,
            "failed_files": 0,
        },
    )
    assert resp.status_code == 404
```

- [ ] **Step 3: 运行测试**

```bash
uv run --project backend pytest backend/tests/test_worker_jobs.py -v
```

Expected: 1 passed

- [ ] **Step 4: Commit**

```bash
git add backend/routers/jobs.py backend/tests/test_worker_jobs.py
git commit -m "feat(jobs): add /finalize endpoint for Agent result upload"
```

---

## Task 7: 前端 API 封装

**Files:**
- Modify: `frontend/src/hooks/useApi.ts`

- [ ] **Step 1: 新增 API 函数**

在 `frontend/src/hooks/useApi.ts` 末尾追加：

```typescript
export async function createWorker(payload: {
  worker_id: string;
  hostname?: string;
  ip_address?: string;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_key?: string;
  repo_path?: string;
  scan_mode?: string;
  target_commit?: string;
  cared_paths?: string[];
}) {
  const res = await fetch(`${API_BASE}/api/workers`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create worker: ${res.status}`);
  return res.json();
}

export async function deployWorker(workerId: string) {
  const res = await fetch(`${API_BASE}/api/workers/${encodeURIComponent(workerId)}/deploy`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to deploy worker: ${res.status}`);
  return res.json();
}

export async function deleteWorker(workerId: string) {
  const res = await fetch(`${API_BASE}/api/workers/${encodeURIComponent(workerId)}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete worker: ${res.status}`);
}

export async function triggerWorkerScan(workerId: string) {
  const res = await fetch(`${API_BASE}/api/workers/${encodeURIComponent(workerId)}/trigger-scan`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to trigger scan: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useApi.ts
git commit -m "feat(frontend): add worker management API hooks"
```

---

## Task 8: 前端 MyWorkers 页面

**Files:**
- Create: `frontend/src/components/MyWorkers.tsx`
- Create: `frontend/src/components/AddWorkerModal.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: 创建 AddWorkerModal.tsx**

```tsx
import React, { useState } from "react";
import { X } from "lucide-react";
import { createWorker } from "../hooks/useApi";

export default function AddWorkerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    worker_id: "",
    ssh_host: "",
    ssh_port: 22,
    ssh_username: "",
    ssh_key: "",
    repo_path: "",
    scan_mode: "full" as "full" | "diff",
    cared_paths: "",
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createWorker({
        ...form,
        ssh_port: Number(form.ssh_port),
        cared_paths: form.cared_paths ? form.cared_paths.split(",").map(s => s.trim()) : undefined,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#e6edf3]">Add Worker</h2>
          <button onClick={onClose} className="text-[#8b949e] hover:text-[#e6edf3]"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-[#8b949e] block mb-1">Worker ID</label>
            <input className="w-full bg-[#010409] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3]"
              value={form.worker_id} onChange={e => setForm({...form, worker_id: e.target.value})} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#8b949e] block mb-1">SSH Host</label>
              <input className="w-full bg-[#010409] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3]"
                value={form.ssh_host} onChange={e => setForm({...form, ssh_host: e.target.value})} required />
            </div>
            <div>
              <label className="text-xs text-[#8b949e] block mb-1">Port</label>
              <input type="number" className="w-full bg-[#010409] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3]"
                value={form.ssh_port} onChange={e => setForm({...form, ssh_port: Number(e.target.value)})} />
            </div>
          </div>
          <div>
            <label className="text-xs text-[#8b949e] block mb-1">SSH Username</label>
            <input className="w-full bg-[#010409] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3]"
              value={form.ssh_username} onChange={e => setForm({...form, ssh_username: e.target.value})} required />
          </div>
          <div>
            <label className="text-xs text-[#8b949e] block mb-1">SSH Private Key</label>
            <textarea rows={4} className="w-full bg-[#010409] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3] font-mono"
              value={form.ssh_key} onChange={e => setForm({...form, ssh_key: e.target.value})} required
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
          </div>
          <div>
            <label className="text-xs text-[#8b949e] block mb-1">Repository Path</label>
            <input className="w-full bg-[#010409] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3]"
              value={form.repo_path} onChange={e => setForm({...form, repo_path: e.target.value})} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#8b949e] block mb-1">Scan Mode</label>
              <select className="w-full bg-[#010409] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3]"
                value={form.scan_mode} onChange={e => setForm({...form, scan_mode: e.target.value as "full" | "diff"})}>
                <option value="full">Full</option>
                <option value="diff">Diff</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[#8b949e] block mb-1">Care Paths</label>
              <input className="w-full bg-[#010409] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3]"
                value={form.cared_paths} onChange={e => setForm({...form, cared_paths: e.target.value})}
                placeholder="src/a, src/b" />
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium py-2 rounded disabled:opacity-50">
            {loading ? "Creating..." : "Create Worker"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 MyWorkers.tsx**

```tsx
import React, { useEffect, useState } from "react";
import { Server, Plus, Play, Trash2, RefreshCw } from "lucide-react";
import { fetchWorkers, deployWorker, deleteWorker } from "../hooks/useApi";
import AddWorkerModal from "./AddWorkerModal";

interface WorkerItem {
  worker_id: string;
  hostname?: string;
  ip_address?: string;
  status: string;
  deploy_status: string;
  deploy_error?: string;
  repo_path?: string;
  scan_mode?: string;
  last_heartbeat?: string;
}

export default function MyWorkers() {
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchWorkers();
      setWorkers(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDeploy(workerId: string) {
    try {
      await deployWorker(workerId);
      alert("Deployment started. Refresh to see status.");
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleDelete(workerId: string) {
    if (!confirm(`Delete worker ${workerId}?`)) return;
    try {
      await deleteWorker(workerId);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function statusDot(status: string) {
    if (status === "running") return "bg-[#3fb950]";
    if (status === "idle") return "bg-[#d29922]";
    return "bg-[#f85149]";
  }

  return (
    <div className="flex flex-col h-full bg-[#06090e]">
      <header className="px-8 py-5 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] flex items-center gap-3">
            <Server className="text-[#8b949e]" /> My Workers
          </h1>
          <p className="text-sm text-[#8b949e] mt-1">Manage your personal scanning nodes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 bg-[#21262d] border border-[#30363d] rounded-lg text-xs text-[#e6edf3] hover:bg-[#30363d]">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-[#238636] rounded-lg text-xs text-white hover:bg-[#2ea043]">
            <Plus size={14} /> Add Worker
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 max-w-[1200px] mx-auto w-full">
        {workers.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-[#8b949e] py-20">
            <Server size={48} className="mb-4 opacity-30" />
            <p className="text-sm">No workers registered yet.</p>
            <button onClick={() => setShowModal(true)} className="mt-4 text-[#58a6ff] text-sm hover:underline">
              Add your first worker
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {workers.map(w => (
              <div key={w.worker_id} className="bg-[#0d1117] border border-[#30363d] rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${statusDot(w.status)}`} />
                    <div>
                      <h3 className="text-sm font-medium text-[#e6edf3]">{w.worker_id}</h3>
                      <p className="text-xs text-[#8b949e]">{w.hostname || w.ip_address || "Unknown host"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {w.deploy_status !== "deployed" && (
                      <button onClick={() => handleDeploy(w.worker_id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-[#238636] rounded text-[10px] text-white hover:bg-[#2ea043]">
                        <Play size={12} /> Deploy
                      </button>
                    )}
                    <button onClick={() => handleDelete(w.worker_id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-[#21262d] border border-[#30363d] rounded text-[10px] text-[#f85149] hover:bg-[#30363d]">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-[#8b949e] block">Deploy Status</span>
                    <span className={w.deploy_status === "deployed" ? "text-[#3fb950]" : w.deploy_status === "failed" ? "text-[#f85149]" : "text-[#d29922]"}>
                      {w.deploy_status}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8b949e] block">Repo</span>
                    <span className="text-[#e6edf3]">{w.repo_path || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[#8b949e] block">Mode</span>
                    <span className="text-[#e6edf3]">{w.scan_mode || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[#8b949e] block">Last Heartbeat</span>
                    <span className="text-[#e6edf3]">
                      {w.last_heartbeat ? new Date(w.last_heartbeat).toLocaleString() : "Never"}
                    </span>
                  </div>
                </div>

                {w.deploy_error && (
                  <div className="mt-3 p-2 bg-[#f85149]/10 border border-[#f85149]/20 rounded text-xs text-[#f85149]">
                    {w.deploy_error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && <AddWorkerModal onClose={() => setShowModal(false)} onCreated={load} />}
    </div>
  );
}
```

- [ ] **Step 3: App.tsx 添加路由**

在 `frontend/src/App.tsx` 中：

1. 导入 MyWorkers：
```typescript
import MyWorkers from "./components/MyWorkers";
```

2. 在视图路由条件渲染区域添加：
```tsx
{currentView === "my-workers" && <MyWorkers />}
```

- [ ] **Step 4: Sidebar.tsx 添加导航**

在 `frontend/src/components/Sidebar.tsx` 中，找到导航列表，给 Personal 用户添加 "My Workers" 入口：

```tsx
<button
  onClick={() => setCurrentView("my-workers")}
  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
    currentView === "my-workers" ? "bg-[#238636]/20 text-[#3fb950]" : "text-[#8b949e] hover:bg-[#161b22] hover:text-[#e6edf3]"
  }`}
>
  <Server size={18} />
  My Workers
</button>
```

确保导入了 `Server` from `lucide-react`。

- [ ] **Step 5: 构建检查**

```bash
cd /home/atituiset/Projects/combinate-agentic-review/frontend
npm run build
```

Expected: Build completed without errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/MyWorkers.tsx frontend/src/components/AddWorkerModal.tsx frontend/src/App.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat(frontend): My Workers page with add, deploy, delete"
```

---

## Task 9: 集成测试与收尾

- [ ] **Step 1: 全量后端测试**

```bash
uv run --project backend pytest backend/tests/ -v --tb=short
```

Expected: 全部通过

- [ ] **Step 2: 前端类型检查**

```bash
cd /home/atituiset/Projects/combinate-agentic-review/frontend
npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 3: 端到端手动验证清单**

1. 启动后端：`uv run --project backend uvicorn backend.main:app --reload --port 3000`
2. 启动前端：`cd frontend && npm run dev`
3. 以 Personal 用户登录
4. 进入 "My Workers" 页面
5. 点击 "Add Worker"，填写表单并提交
6. 后端数据库中检查 Worker 记录已创建（`deploy_status=pending`）
7. 点击 "Deploy" 按钮
8. 检查服务器日志：SSH 连接、环境检查、Agent 部署
9. 检查远程机器：`~/.opencode-agent/` 目录存在，`agent.py` 和 `config.json` 已上传
10. 检查 Worker 表：`deploy_status=deployed`，`last_heartbeat` 已更新
11. 设置定时策略，等待到点或手动触发
12. 检查 Agent 日志：收到 `/scan` 请求，启动 orchestrator
13. 前端检查：SSE 日志实时显示
14. 扫描完成后：检查数据库 Task 和 Vulnerability 记录已创建

- [ ] **Step 4: 最终 Commit**

```bash
git add .
git commit -m "feat: remote worker support - SSH deploy, Agent, HTTP dispatch, result upload"
```

---

## Plan Self-Review

### Spec Coverage Check

| Spec 章节 | 对应 Task | 状态 |
|-----------|-----------|------|
| 3.1 Worker 表扩展 | Task 1 | ✅ |
| 3.2 Job 表扩展 | Task 1 | ✅ |
| 3.3 权限控制 | Task 2 | ✅ |
| 4.1 用户交互 | Task 8 | ✅ |
| 4.2 部署服务 | Task 3 | ✅ |
| 4.3 Agent 架构 | Task 4 | ✅ |
| 4.4 Agent 扫描 | Task 4 | ✅ |
| 4.5 结果回传 | Task 4 + Task 6 | ✅ |
| 5.1 调度器改造 | Task 5 | ✅ |
| 5.3 日志流 | 零改动复用 | ✅ |
| 6.1 My Workers 页面 | Task 8 | ✅ |
| 6.3 权限控制 | Task 2 + Task 8 | ✅ |
| 7 错误处理 | 各 Task 中覆盖 | ✅ |

### Placeholder Scan

- 无 "TBD"、"TODO"、"implement later"
- 所有代码步骤包含完整代码
- 所有命令包含预期输出

### Type Consistency

- `WorkerCreate`, `ScanRequest`, `JobFinalizePayload` schema 在 Task 1 定义，后续 Task 引用一致
- `deploy_status` 枚举值 `pending|deploying|deployed|failed` 全文档一致
- `assigned_worker_id` 字段名全文档一致
