# 快速开始

## 前置条件

- Python 3.10+
- Node.js 18+
- Redis 7+
- [uv](https://docs.astral.sh/uv/) (推荐) 或 pip
- [mdbook](https://rust-lang.github.io/mdBook/) (仅文档构建)

## 1. 启动后端

```bash
# 使用 uv (推荐)
cd backend
uv venv && source .venv/bin/activate
uv pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 或使用 pip
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

后端启动时自动：
- 创建 SQLite 数据库和默认 admin 用户 (admin / admin123)
- 生成 SSH Deploy Key (`~/.opencode/keys/id_ed25519`)
- 启动 Dispatcher 调度循环（轮询 Redis 队列，分发给 Agent）

## 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173

## 3. 启动 Redis

```bash
redis-server
```

或使用 Docker：

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

## 4. 部署远程 Agent

### 4a. 获取 Deploy Key 公钥

登录前端 → My Workers → 点击 Deploy Key 按钮，或：

```bash
curl http://localhost:8000/api/workers/deploy-key -H "Authorization: Bearer <token>"
```

将返回的公钥添加到远程机器的 `~/.ssh/authorized_keys`。

### 4b. 在前端添加 Worker

1. 进入 My Workers 页面
2. 点击 Add Worker
3. 填写 Worker ID、SSH Host/Port/Username、Repo Path、Scan Mode
4. 点击 Deploy — 后端自动 SSH 部署 Agent

### 4c. 或手动部署 Agent

1. 将 `worker/agent.py`、`worker/orchestrator.py`、`worker/git_sync.py` 复制到远程机器
2. 创建 `~/.opencode-agent/config.json`：

```json
{
  "worker_id": "remote-01",
  "backend_url": "http://<backend-ip>:8000",
  "redis_url": "redis://<redis-ip>:6379/0",
  "repo_path": "/path/to/repo"
}
```

3. 启动 Agent：

```bash
pip install redis httpx fastapi uvicorn
cd ~/.opencode-agent
nohup python3 agent.py > logs/agent.log 2>&1 &
```

## 5. 触发扫描

### 通过前端

- Dashboard → Trigger Global MR Scan — 全量扫描
- Scan Jobs Queue → Create Job — 创建单个扫描作业

### 通过 API

```bash
curl -X POST http://localhost:8000/api/jobs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"mode": "full", "worker_id": "remote-01"}'
```

## Docker Compose 一键启动

```bash
docker compose up -d
```

包含：后端 (8000) + 前端 (5173) + Redis (6379)
