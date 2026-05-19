# Docker 部署

## Docker Compose

**`docker-compose.yml`** 定义了两个服务：

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  app:
    build: .
    ports:
      - "8000:8000"
    depends_on:
      - redis
    environment:
      - APP_REDIS_URL=redis://redis:6379
    volumes:
      - ./data:/app/data
      - ./reports:/app/reports
```

### 持久化卷

| 卷 | 挂载点 | 说明 |
|----|--------|------|
| `redis_data` | Redis 内部 | Redis 数据持久化 |
| `./data` | `/app/data` | SQLite 数据库 |
| `./reports` | `/app/reports` | 扫描报告目录 |

## Dockerfile

多阶段构建，优化镜像大小：

```dockerfile
# Stage 1: 前端构建
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/ .
RUN npm install && npm run build

# Stage 2: 运行时
FROM python:3.12-slim
WORKDIR /app

# 安装 Python 依赖 (使用 uv 加速)
COPY requirements.txt .
RUN pip install uv && uv pip install --system -r requirements.txt

# 复制前端构建产物
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 复制后端代码
COPY backend/ ./backend/
COPY worker/ ./worker/
COPY worker_node.py .

# 启动
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 启动命令

```bash
# 构建并启动
docker compose up --build -d

# 查看日志
docker compose logs -f app

# 停止
docker compose down

# 停止并清理卷
docker compose down -v
```

## 独立 Worker 节点 Docker 部署

```bash
# 在远程机器上
docker run -d \
  --name worker-node \
  -e GATEWAY_URL=http://gateway-host:8000 \
  -e REDIS_URL=redis://redis-host:6379 \
  combinate-agentic-review \
  python3 worker_node.py
```

## 生产环境建议

- 使用 PostgreSQL 替代 SQLite
- 配置 Redis 密码认证
- 设置 HTTPS 反向代理 (Nginx/Caddy)
- 修改默认 admin 密码
- 配置日志收集
