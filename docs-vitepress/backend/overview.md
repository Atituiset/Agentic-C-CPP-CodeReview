# 后端概览与入口

## 入口文件

**`backend/main.py`** — FastAPI 应用入口

### 启动生命周期

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. 创建数据库表
    Base.metadata.create_all(bind=engine)
    # 2. Seed 默认管理员 (admin/admin123)
    seed_default_admin()
    # 3. 生成 SSH Deploy Key (~/.opencode/keys/id_ed25519)
    ensure_deploy_key()
    # 4. 启动 APScheduler 调度器
    scheduler = get_scheduler()
    scheduler.start()
    # 5. 启动 Dispatcher 调度循环 (后台任务)
    asyncio.create_task(dispatcher_loop())
    # 6. 初始化 Redis 连接池
    await redis_client.initialize()
    yield
    # 清理
    await redis_client.close()
```

### 挂载的路由

| 路由前缀 | 模块 | 说明 |
|----------|------|------|
| `/api/auth` | `routers/auth.py` | 认证 (login/me) |
| `/api/jobs` | `routers/jobs.py` | 扫描作业管理 (含 /finalize, /resume, /cancel) |
| `/api/workers` | `routers/workers.py` | Worker 节点管理 (含 /deploy, /deploy-logs, /deploy-key) |
| `/api/sse` | `routers/sse.py` | Server-Sent Events |
| `/api/slot` | `routers/slots.py` | Worker Slot 管理 |
| `/api/reports` | `routers/reports.py` | 报告查看 |
| `/api/users` | `routers/users.py` | 用户管理 |
| `/api/vulnerabilities` | `routers/vulnerabilities.py` | 漏洞管理 |
| `/api/memory-rules` | `routers/memory.py` | Memory Rule 管理 (含 /submit-global) |

### SPA 路由兜底

前端构建产物通过 FastAPI StaticFiles 中间件提供服务，所有非 /api/ 路径返回 index.html：

```python
app.mount("/", StaticFiles(directory="frontend/dist", html=True))
```

## 配置

**`backend/config.py`** — Pydantic Settings

```python
class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379"
    database_url: str = "sqlite:///./data/app.db"
    port: int = 8000
```

## 数据库

**`backend/database.py`** — SQLAlchemy 引擎与会话

```python
engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()
```

## Redis 客户端

**`backend/redis_client.py`** — 异步 Redis 连接池

| 函数 | 说明 |
|------|------|
| `publish_log(channel, message)` | 发布日志消息到 Pub/Sub |
| `publish_meta(channel, data)` | 发布元数据到 Pub/Sub |
| `push_job_queue(job_data)` | LPUSH 作业到 scan:job:queue |
| `pop_job_queue(timeout)` | BRPOP 从 scan:job:queue 取作业 |
