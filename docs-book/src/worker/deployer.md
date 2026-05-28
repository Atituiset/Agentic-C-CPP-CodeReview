# SSH 部署服务

**`backend/services/deployer.py`** — 后端自动部署 Agent 到远程机器

## 概述

Deployer 使用 asyncssh 库通过 SSH 连接到远程 Worker 机器，自动完成环境检查、依赖安装、文件上传、进程启动和注册确认。

## 触发方式

```bash
POST /api/workers/{worker_id}/deploy
```

部署作为 FastAPI BackgroundTasks 执行，API 立即返回。

## 部署流程 (10 步)

1. 更新 Worker.deploy_status = "deploying"
2. asyncssh.connect() — 优先 ssh_key > ssh_password > 后端 deploy key
3. 检查 Python 版本 — 要求 3.10+
4. 安装依赖 — pip install redis httpx fastapi uvicorn
5. 创建目录 — mkdir -p ~/.opencode-agent/logs ~/.opencode-agent/worker
6. SFTP 上传 — agent.py, orchestrator.py, git_sync.py, config.json
7. 终止旧进程 — pkill -f 'python3 agent.py'; sleep 2
8. 启动 Agent — nohup python3 agent.py > logs/agent.log 2>&1 &
9. 等待注册确认 (最多 60s，轮询 Worker.last_heartbeat)
10. 更新 deploy_status = "deployed" / "failed"

## SSH 认证方式

| 优先级 | 字段 | 说明 |
|--------|------|------|
| 1 | ssh_key | 用户提供的 SSH 私钥 |
| 2 | ssh_password | SSH 密码认证 |
| 3 | 后端 deploy key | ~/.opencode/keys/id_ed25519 (自动生成) |

known_hosts 检查已禁用 (known_hosts=None)，适用于内网动态部署环境。

## Deploy Key 管理 (`services/deploy_key.py`)

后端启动时自动生成 Ed25519 密钥对：

- **私钥**: ~/.opencode/keys/id_ed25519
- **公钥**: ~/.opencode/keys/id_ed25519.pub

```bash
GET /api/workers/deploy-key
→ {"public_key": "ssh-ed25519 AAAA... opencode-deploy"}
```

## 部署日志

每个步骤通过 _log_step() 追加到 Worker.deploy_logs (JSON 数组)：

```json
[
  {"ts": "2026-05-27T12:00:00Z", "step": "start", "msg": "Deployment started for remote-01"},
  {"ts": "2026-05-27T12:00:01Z", "step": "connect", "msg": "Connecting to 192.168.1.100:22"},
  {"ts": "2026-05-27T12:00:02Z", "step": "connected", "msg": "SSH connection established"},
  {"ts": "2026-05-27T12:00:15Z", "step": "done", "msg": "Deployment completed successfully"}
]
```

前端 MyWorkers 页面可通过 GET /api/workers/{id}/deploy-logs 查看部署进度。

## 错误处理

- Python 版本不满足 → DeploymentError
- 依赖安装失败 → DeploymentError
- Agent 未在 60s 内注册 → DeploymentError
- SSH 连接失败 → 记录到 Worker.deploy_error

失败时 Worker.deploy_status = "failed"，deploy_error 包含错误描述。
