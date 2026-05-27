# 远程 Worker 节点支持设计文档

**日期**: 2026-05-25  
**主题**: Personal 用户远程 Worker 注册、部署与调度  
**方案**: SSH 部署 + 常驻 Agent（方案 2）

---

## 1. 概述

### 1.1 背景
当前系统仅支持后端服务器本地启动 `orchestrator` 进行扫描（`worker_id = "local"`）。
随着团队规模扩大，需要支持**Personal 用户将自己拥有的机器注册为 Worker 节点**，由看板服务器统一调度执行扫描任务。

### 1.2 目标
- Personal 用户可在看板页面上添加并管理自己的 Worker 机器
- 服务器通过 SSH 自动部署轻量 Agent 到远程机器
- Agent 常驻运行，自动检查环境并安装缺失依赖
- 服务器端 APScheduler 统一调度各 Worker 的定时扫描
- 扫描日志通过现有 Redis + SSE 框架实时流式推送到前端
- 扫描结果由 Agent 解析后 HTTP 批量上报给后端

### 1.3 非目标
- 不支持公网/NAT 环境下的 Worker（本场景限定公司内网）
- 不替换现有的本地 `local` Worker，两者共存
- 不引入消息队列（复用现有 Redis pub/sub）

---

## 2. 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                           看板服务器                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ FastAPI      │  │ APScheduler  │  │ Redis        │              │
│  │ - Worker CRUD│  │ - 定时触发   │  │ - 日志中转   │              │
│  │ - 部署服务   │  │ - 分发任务   │  │ - SSE pub/sub│              │
│  │ - 结果接收   │  │              │  │              │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│         │                   │                  │                    │
│         │ HTTP POST /scan   │ HTTP 心跳       │ Redis publish      │
│         ▼                   ▼                  ▼                    │
└─────────────────────────────────────────────────────────────────────┘
         │                   │                  │
         │                   │                  │
         ▼                   ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Worker 机器（用户机器）                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Agent (常驻 FastAPI, port 8765)                              │  │
│  │  ├─ POST /register  ──-> 后端注册                             │  │
│  │  ├─ POST /heartbeat ──-> 后端心跳                             │  │
│  │  ├─ POST /scan      ──-> 启动 orchestrator                    │  │
│  │  └─ monitor_scan()  ──-> 解析报告 + HTTP 批量上报结果         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                           │                                         │
│                           │ 启动子进程                               │
│                           ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ orchestrator.py (扫描引擎)                                    │  │
│  │  ├─ 扫描代码 → 生成 reports/ 目录                             │  │
│  │  └─ _redis_push() → Redis 推送日志                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 数据模型变更

### 3.1 Worker 表扩展

```python
class Worker(Base):
    __tablename__ = "workers"

    # 已有字段
    id = Column(String(36), primary_key=True, default=generate_uuid)
    worker_id = Column(String(64), unique=True, nullable=False)
    hostname = Column(String(256), nullable=True)
    ip_address = Column(String(64), nullable=True)
    status = Column(String(16), default="idle")
    current_job_id = Column(String(36), nullable=True)
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)
    registered_at = Column(DateTime(timezone=True), server_default=func.now())
    capabilities = Column(Text, nullable=True)
    show_thinking = Column(Boolean, default=True)

    # === 新增字段 ===
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    ssh_host = Column(String(256), nullable=True)       # SSH 连接地址
    ssh_port = Column(Integer, default=22)              # SSH 端口
    ssh_username = Column(String(128), nullable=True)   # SSH 用户名
    ssh_key = Column(Text, nullable=True)               # SSH 私钥（加密存储）
    deploy_status = Column(String(16), default="pending")  # pending | deploying | deployed | failed
    deploy_error = Column(Text, nullable=True)          # 部署失败原因
    repo_path = Column(Text, nullable=True)             # 扫描仓库路径
    scan_mode = Column(String(16), default="full")      # full | diff
    target_commit = Column(String(64), nullable=True)   # diff 模式起始 commit
    cared_paths = Column(Text, nullable=True)           # JSON 数组，关注目录
```

### 3.2 Job 表扩展

```python
class Job(Base):
    # 新增字段
    assigned_worker_id = Column(String(64), nullable=True)  # 指定执行 Worker
    dispatch_error = Column(Text, nullable=True)            # 分发失败原因
```

### 3.3 权限规则

| 角色 | Worker 权限 |
|------|-------------|
| admin | 全部 CRUD，可读所有 Worker 状态 |
| committer | 同 admin |
| user (Personal) | 只能看到 `owner_id = 自己` 的 Worker，增删改自己的 Worker |

---

## 4. Agent 部署流程

### 4.1 用户交互

1. Personal 用户进入 "My Workers" 页面
2. 点击 [+ Add Worker]，填写表单：
   - Worker 名称、SSH 地址、端口、用户名、私钥
   - 仓库路径、扫描模式、关注目录、定时策略
3. 点击 [Deploy]，前端轮询 `deploy_status` 显示进度
4. 部署完成后，Worker 卡片显示在线状态

### 4.2 服务器端部署服务 (`backend/services/deployer.py`)

```python
async def deploy_worker(worker_id: str):
    """通过 SSH 连接到 Worker 机器，部署 Agent。"""
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    worker.deploy_status = "deploying"
    db.commit()

    try:
        async with asyncssh.connect(
            host=worker.ssh_host,
            port=worker.ssh_port,
            username=worker.ssh_username,
            client_keys=[worker.ssh_key],
        ) as conn:

            # 1. 检查 Python 版本（要求 >= 3.10）
            result = await conn.run("python3 --version")
            # ... 版本检查逻辑

            # 2. 检查并安装依赖
            check = await conn.run("python3 -c 'import redis.asyncio, httpx, fastapi, uvicorn'")
            if check.exit_status != 0:
                await conn.run("python3 -m pip install --user redis httpx fastapi uvicorn")

            # 3. 创建 Agent 目录
            await conn.run("mkdir -p ~/.opencode-agent/logs")

            # 4. SFTP 上传 agent.py 和 config.json
            async with conn.start_sftp_client() as sftp:
                await sftp.put(AGENT_TEMPLATE_PATH, ".opencode-agent/agent.py")
                config = {
                    "worker_id": worker.worker_id,
                    "backend_url": settings.BACKEND_URL,
                    "redis_url": settings.REDIS_URL,
                    "repo_path": worker.repo_path,
                }
                await sftp.put(StringIO(json.dumps(config)), ".opencode-agent/config.json")

            # 5. 启动 Agent（nohup + PID 文件）
            await conn.run(
                "cd ~/.opencode-agent && nohup python3 agent.py > logs/agent.log 2>&1 & echo $! > agent.pid"
            )

            # 6. 等待 Agent 注册（轮询 last_heartbeat，最多 60 秒）
            for _ in range(30):
                await asyncio.sleep(2)
                db.refresh(worker)
                if worker.deploy_status == "deployed":
                    return

            raise DeploymentError("Agent did not register in time")

    except Exception as e:
        worker.deploy_status = "failed"
        worker.deploy_error = str(e)
        db.commit()
        raise
```

### 4.3 Agent 架构 (`agent.py`)

Agent 是单文件 FastAPI 应用，部署到 `~/.opencode-agent/agent.py`：

```
~/.opencode-agent/
├── agent.py          # Agent 主程序（FastAPI + uvicorn）
├── config.json       # 后端地址、worker_id、Redis 等配置
├── logs/
│   └── agent.log     # Agent 自身运行日志
└── agent.pid         # 进程 PID
```

核心能力：
- **启动注册**：`POST /api/workers/{worker_id}/register`
- **定时心跳**：每 30 秒 `POST /api/workers/{worker_id}/heartbeat`
- **接收扫描指令**：`POST /scan` → 启动 orchestrator 子进程
- **进程监控**：`monitor_scan()` 协程等待 orchestrator 结束，解析报告并上报
- **环境自检**：启动时检查依赖，缺失则自动 `pip install`

### 4.4 Agent 扫描执行流程

```python
@app.post("/scan")
async def start_scan(payload: ScanRequest):
    if is_orchestrator_running():
        return {"ok": False, "error": "Another scan is running"}

    env = os.environ.copy()
    env["JOB_ID"] = payload.job_id
    env["WORKER_ID"] = config["worker_id"]
    env["REDIS_URL"] = config["redis_url"]
    env["BACKEND_URL"] = config["backend_url"]
    env["REPORT_DIR"] = f"/tmp/opencode-reports/{payload.job_id}"

    proc = subprocess.Popen(
        ["python3", "orchestrator.py",
         f"--{payload.mode}", "--repo", payload.repo_path, "-c", "3"],
        env=env,
    )

    asyncio.create_task(monitor_scan(payload.job_id, proc, env["REPORT_DIR"]))
    return {"ok": True}
```

### 4.5 结果回传

Agent 的 `monitor_scan` 在 orchestrator 结束后：

1. 读取 `reports/` 目录下的 `.md` 报告文件
2. 复用 `report_parser.py` 解析漏洞
3. 批量 HTTP POST 到后端 `/api/jobs/{job_id}/finalize`

后端新增接口：

```python
@router.post("/api/jobs/{job_id}/finalize")
async def finalize_job(job_id: str, payload: JobFinalizePayload, db: Session = ...):
    """Agent 扫描完成后上报结果，后端批量创建 Task 和 Vulnerability。"""
```

---

## 5. 服务器端调度

### 5.1 改造 `_run_worker_scan`

当前：创建 Job → `push_job_queue` → 后端本地 `worker_loop` 消费

改造后：

```python
async def _run_worker_scan(worker_id: str):
    """定时触发：为指定 Worker 创建扫描任务并 HTTP 分发给 Agent。"""
    db = SessionLocal()
    try:
        worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
        if not worker or worker.deploy_status != "deployed":
            logger.warning(f"Worker {worker_id} not ready, skipping scan")
            return

        # 检查 Worker 是否在线（心跳在 2 分钟内）
        if worker.last_heartbeat and (now - worker.last_heartbeat) > timedelta(minutes=2):
            logger.warning(f"Worker {worker_id} offline, skipping scan")
            return

        # 创建 Job
        job = Job(
            repo_path=worker.repo_path,
            mode=worker.scan_mode,
            status="pending",
            assigned_worker_id=worker_id,
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        # 构建 report_dir（Agent 本地路径）
        report_dir = f"/tmp/opencode-reports/{job.id}"

        # HTTP 直推 Agent
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"http://{worker.ip_address}:8765/scan",
                json={
                    "job_id": job.id,
                    "repo_path": worker.repo_path,
                    "mode": worker.scan_mode,
                    "report_dir": report_dir,
                },
                timeout=10.0,
            )

        if resp.status_code == 200:
            job.status = "dispatched"
            logger.info(f"Job {job.id} dispatched to {worker_id}")
        else:
            job.status = "failed"
            job.dispatch_error = f"Agent returned {resp.status_code}: {resp.text}"
            logger.error(f"Failed to dispatch job {job.id} to {worker_id}")

        db.commit()

    except Exception as e:
        logger.error(f"_run_worker_scan failed for {worker_id}: {e}")
    finally:
        db.close()
```

### 5.2 调度器改造

- `ScanScheduler._add_worker_jobs` 保持为每个 Worker 创建独立 cron job
- 新增 Worker 时调用 `reload_worker_schedule(worker_id)` 添加定时任务
- 删除 Worker 时移除对应 cron job

### 5.3 日志流（零改动复用）

```
orchestrator（远程 Worker）
    └── _redis_push(slot_id, log_data)
            └── Redis publish(f"slot:{worker_id}:{slot_id}:logs")
                    └── 前端 SSE 订阅对应 channel
                            └── 实时 ANSI 彩色日志
```

`orchestrator.py` 已支持通过 `WORKER_ID` 环境变量隔离 Redis channel，前端 SSE 也已按 `worker_id` 隔离。**无需任何代码改动**。

---

## 6. 前端设计

### 6.1 新增页面

| 页面 | 路径 | 可见角色 |
|------|------|----------|
| My Workers | `/my-workers` | user (Personal) |
| Worker Detail | `/worker/:id` | owner + admin + committer |

### 6.2 组件

**WorkerCard**：展示 Worker 状态摘要
- 状态指示灯（🟢 Online / 🟡 Idle / 🔴 Offline）
- 最近心跳时间
- 下次扫描时间
- 部署状态
- 操作按钮：[View Logs] [Config] [Delete] [Trigger Scan]

**AddWorkerModal**：添加 Worker 表单
- SSH 连接信息（Host, Port, Username, Private Key）
- 扫描配置（Repo Path, Mode, Care Paths）
- 定时策略（Scan Time）

**DeployProgress**：部署进度展示
- 实时轮询 `deploy_status`
- 分步骤进度条
- 失败时展示 `deploy_error`

### 6.3 权限控制

```typescript
// useApi.ts 中请求自动带上 owner_id 过滤
export async function fetchWorkers() {
  const res = await fetch(`${API_BASE}/api/workers`, { headers: getHeaders() });
  // 后端已根据当前用户角色过滤，前端无需额外处理
}
```

---

## 7. 错误处理

| 场景 | 检测方式 | 处理策略 |
|------|----------|----------|
| SSH 连接失败 | deployer.py 抛出异常 | `deploy_status = failed`，记录 `deploy_error`，前端展示 |
| Python 版本过低 | deployer.py 检查版本 | 同上，提示用户升级 Python |
| pip install 失败 | deployer.py 检查 exit code | 同上，提示手动安装 |
| Agent 启动后未注册 | 轮询 60 秒超时 | `deploy_status = failed`，记录原因 |
| Agent 心跳丢失 | `last_heartbeat` > 2min | Worker 状态显示 Offline，调度器跳过该 Worker |
| HTTP 分发扫描失败 | Agent `/scan` 返回非 200 | Job.status = failed，记录 `dispatch_error`，等待下次定时触发 |
| orchestrator 崩溃 | Agent `monitor_scan` 检测非 0 退出码 | Agent 上报 `status = failed`，后端记录 |
| 扫描被 stop 中断 | APScheduler `_run_worker_stop` + Agent 转发 SIGTERM | 上报 `status = interrupted`，保留 checkpoint |

---

## 8. 范围边界

### 8.1 在本期范围内
- [x] Worker 表扩展 + 归属关系
- [x] SSH 部署服务（asyncssh）
- [x] Agent 单文件实现（FastAPI + 心跳 + 扫描 + 上报）
- [x] 调度器改造（HTTP 直推 Agent）
- [x] 后端新增 `/finalize` 接口接收扫描结果
- [x] 前端 "My Workers" 页面（Personal 视图）
- [x] 权限控制（owner_id 过滤）

### 8.2 不在本期范围内
- [ ] 共享存储/NFS 方案（被 Agent HTTP 上报替代）
- [ ] Agent 自动更新/热升级
- [ ] Worker 机器资源监控（CPU/内存/磁盘）
- [ ] 多 Worker 负载均衡（当前固定分配给指定 Worker）
- [ ] 看板服务器通过 SSH 执行非部署类操作（部署后只通过 Agent HTTP 通信）

---

## 9. 关键依赖

| 包 | 用途 | 安装位置 |
|----|------|----------|
| `asyncssh` | 服务器端 SSH 连接 | 后端依赖 |
| `fastapi` | Agent HTTP 服务 | Agent 依赖（自动安装） |
| `uvicorn` | Agent ASGI 服务器 | Agent 依赖（自动安装） |
| `httpx` | Agent HTTP 客户端 | Agent 依赖（自动安装） |
| `redis` | Agent Redis 客户端 | Agent 依赖（自动安装） |
