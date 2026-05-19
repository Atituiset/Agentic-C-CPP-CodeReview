# 配置与基础设施

## 应用配置 (`backend/config.py`)

使用 Pydantic Settings 管理配置，支持环境变量覆盖：

```python
class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379"
    database_url: str = "sqlite:///./data/app.db"
    port: int = 8000

    class Config:
        env_prefix = "APP_"  # 环境变量前缀
```

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `APP_REDIS_URL` | `redis://localhost:6379` | Redis 连接地址 |
| `APP_DATABASE_URL` | `sqlite:///./data/app.db` | 数据库连接字符串 |
| `APP_PORT` | `8000` | 服务端口 |

## 数据库 (`backend/database.py`)

- **引擎**: SQLAlchemy `create_engine()`
- **会话**: `sessionmaker(bind=engine)`
- **基类**: `declarative_base()`
- **当前**: SQLite (`data/app.db`)
- **规划**: 迁移至 PostgreSQL

## Redis (`backend/redis_client.py`)

异步 Redis 客户端，使用连接池：

```python
class RedisClient:
    async def initialize(self):
        self.pool = await aioredis.create_redis_pool(settings.redis_url)

    async def publish_log(self, channel: str, message: str):
        await self.pool.publish(channel, json.dumps({
            "type": "log", "data": message
        }))

    async def push_job_queue(self, job_data: dict):
        await self.pool.lpush("job_queue", json.dumps(job_data))

    async def pop_job_queue(self, timeout: int = 5):
        result = await self.pool.brpop("job_queue", timeout=timeout)
        return json.loads(result[1]) if result else None
```

### Redis 用途

| 用途 | 数据结构 | 频道/键 |
|------|----------|---------|
| 作业队列 | List | `job_queue` (LPUSH/BRPOP) |
| 日志推送 | Pub/Sub | `worker_{id}_slot_{n}` |
| 元数据推送 | Pub/Sub | `worker_{id}_slot_{n}_meta` |

## Pydantic Schema (`backend/models/schemas.py`)

定义所有 API 请求/响应模型：

### 核心 Schema

| Schema | 用途 |
|--------|------|
| `JobCreate` | 创建作业请求 |
| `JobResponse` | 作业响应 |
| `TaskResponse` | 任务响应 |
| `SlotAcquire` | 占用槽位请求 |
| `SlotPush` | 推送日志请求 |
| `SlotStatus` | 槽位状态 |
| `UserCreate` | 创建用户请求 |
| `UserResponse` | 用户响应 |
| `LoginPayload` | 登录请求 |
| `LoginResponse` | 登录响应（含 JWT） |
| `MeResponse` | 当前用户信息 |
| `WorkerRegisterResponse` | Worker 注册响应 |
| `VulnerabilityResponse` | 漏洞响应 |
| `MemoryRuleCreate` | 创建 Memory Rule |
| `MemoryRuleResponse` | Memory Rule 响应 |

## 测试 (`backend/tests/`)

16 个测试文件覆盖核心功能：

| 测试文件 | 覆盖范围 |
|----------|----------|
| `test_deps.py` | 依赖注入 |
| `test_orm.py` | ORM 模型 |
| `test_schemas.py` | Pydantic Schema |
| `test_redis.py` | Redis 客户端 |
| `test_orchestrator_import.py` | Orchestrator 导入 |
| `test_main.py` | 主应用 |
| `test_slots.py` | Slot 管理 |
| `test_sse.py` | SSE 通道 |
| `test_jobs.py` | 作业管理 |
| `test_worker.py` | Worker 循环 |
| `test_reports.py` | 报告查看 |
| `test_integration.py` | 集成测试 |
| `test_auth_service.py` | 认证服务 |
| `test_auth.py` | 认证路由 |
| `test_users.py` | 用户管理 |
| `test_vulnerabilities.py` | 漏洞管理 |
| `test_memory.py` | Memory Rule |
| `test_resume.py` | 作业恢复 |
| `test_scheduler.py` | 调度器 |
| `test_git_sync.py` | Git 同步 |

运行测试：

```bash
pytest backend/tests/ -v
```
