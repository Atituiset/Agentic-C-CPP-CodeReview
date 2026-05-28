# 核心服务

所有服务定义于 `backend/services/`，共 10 个模块。

## Auth Service (`auth_service.py`)

- `authenticate_user(username, password)` — 验证用户凭据，返回 JWT Token
- `get_current_user(token)` — 从 Token 解析当前用户
- `create_user(username, password, role)` — 创建用户 (bcrypt 哈希密码)

## Worker Service (`worker.py`)

- Worker CRUD 操作
- 心跳更新、状态管理
- Worker 所有权过滤 (owner_id)
- Git 状态快照更新
- 定时扫描配置管理

## Dispatcher (`dispatcher.py`)

后端 lifespan 中启动的后台调度循环：

```python
async def dispatcher_loop():
    while True:
        job_data = await redis.brpop("scan:job:queue", timeout=5)
        if job_data:
            job = get_job_from_db(job_data)
            worker = _find_available_worker(db)
            if worker:
                await _dispatch_to_worker(job, worker)
            else:
                # 无可用 Worker，重新入队
                redis.lpush("scan:job:queue", job_data)
```

- `_find_available_worker(db)` — 查找 status=idle 且 deploy_status=deployed 的 Worker
- `_dispatch_to_worker(job, worker)` — HTTP POST /scan 到 Agent，更新 Job.status=dispatched

## Deployer (`deployer.py`)

SSH 自动部署服务，10 步流程：

1. 更新 Worker.deploy_status = "deploying"
2. SSH 连接 (优先 ssh_key > ssh_password > 后端 deploy key)
3. 检查 Python 版本 (要求 3.10+)
4. 安装依赖 (pip install redis httpx fastapi uvicorn)
5. 创建目录 (~/.opencode-agent/)
6. SFTP 上传文件 (agent.py, orchestrator.py, git_sync.py, config.json)
7. 终止旧 Agent 进程 (pkill)
8. 启动新 Agent (nohup python3 agent.py &)
9. 等待注册确认 (最多 60s，轮询 Worker.last_heartbeat)
10. 更新 deploy_status = "deployed" / "failed"

每步通过 `_log_step()` 追加到 Worker.deploy_logs (JSON 数组)。

异常处理：`DeploymentError` 异常会设置 deploy_status="failed" 和 deploy_error。

## Deploy Key (`deploy_key.py`)

后端启动时自动生成 Ed25519 密钥对：

- `ensure_deploy_key()` — 生成密钥对（如不存在）
- `get_private_key_path()` — 返回 ~/.opencode/keys/id_ed25519
- `get_public_key()` — 返回公钥内容

前端可通过 `GET /api/workers/deploy-key` 获取公钥，添加到远程机器的 authorized_keys。

## Git Sync (`git_sync.py`)

基于 GitPython 的仓库同步服务：

- `get_head_commit(repo_path)` — 获取当前 HEAD
- `get_cpp_file_count(repo_path)` — 获取 C/C++ 文件数
- `get_changes_since(repo_path, commit)` — 获取增量变更
- `get_all_cpp_files(repo_path)` — 获取所有 C/C++ 文件
- `get_diff(repo_path, commit)` — 获取 diff 内容

## Report Parser (`report_parser.py`)

从 Orchestrator 生成的 Markdown 报告中解析漏洞：

- `parse_vulnerability_report(markdown_content)` — 解析单个报告文件
- 识别格式：`## VULN-XXX: Title` + Severity / File / Category / Description / Recommendation
- 返回结构化漏洞列表

## Runner (`runner.py`)

本地 Worker 运行器（遗留，已被 Dispatcher + Agent 取代）：

- 启动 Orchestrator 子进程
- 监控进程状态
- 收集结果

## Scheduler (`scheduler.py`)

APScheduler 定时扫描管理：

- 全局 Schedule (SchedulerConfig)
- Worker 级 Schedule (WorkerScheduleConfig)
- Cron 表达式解析与执行
