# 配置与基础设施

## 应用配置 (`backend/config.py`)

使用 Pydantic Settings 管理配置，支持环境变量覆盖：

```python
class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379"
    database_url: str = "sqlite:///./data/app.db"
    port: int = 8000

    class Config:
        env_prefix = "APP_"
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

异步 Redis 客户端，使用连接池。

### Redis 键/频道命名

| 用途 | 数据结构 | 键/频道 |
|------|----------|---------|
| 作业队列 | List | `scan:job:queue` (LPUSH/BRPOP) |
| Slot 日志推送 | Pub/Sub | `slot:{worker_id}:{slot_id}` |
| Slot 元数据推送 | Pub/Sub | `slot:{worker_id}:{slot_id}` (同频道，type 区分) |

## Pydantic Schema (`backend/models/schemas.py`)

共 27 个 API 请求/响应模型：

| Schema | 用途 |
|--------|------|
| `JobCreate` | 创建作业请求 |
| `JobResponse` | 作业响应 |
| `JobFinalizePayload` | Agent Finalize 请求 (含 results 数组) |
| `JobResumeRequest` | 恢复作业请求 |
| `ScanRequest` | Agent /scan 请求 |
| `TaskResponse` | 任务响应 |
| `LoginPayload` | 登录请求 |
| `LoginResponse` | 登录响应 (含 JWT) |
| `MeResponse` | 当前用户信息 |
| `UserCreate` | 创建用户请求 |
| `UserResponse` | 用户响应 |
| `WorkerCreate` | 创建 Worker 请求 (含 SSH 配置) |
| `WorkerUpdate` | 更新 Worker 请求 |
| `WorkerResponse` | Worker 响应 |
| `WorkerRegister` | Agent 注册请求 |
| `WorkerHeartbeat` | Agent 心跳请求 |
| `WorkerDeployRequest` | 部署 Worker 请求 |
| `WorkerGitStatusResponse` | Worker Git 状态响应 |
| `WorkerScheduleConfigResponse` | Worker Schedule 响应 |
| `WorkerScheduleConfigUpdate` | Worker Schedule 更新请求 |
| `SlotAcquirePayload` | 占用槽位请求 |
| `SlotPushPayload` | 推送日志请求 |
| `SlotStatusPayload` | 槽位状态更新 |
| `VulnerabilityResponse` | 漏洞响应 |
| `GitSyncResponse` | Git 同步统计响应 |
| `SchedulerStatusResponse` | 调度器状态响应 |

## 测试 (`backend/tests/`)

27 个测试文件覆盖核心功能：

| 测试文件 | 覆盖范围 |
|----------|----------|
| `test_auth.py` | 认证路由 |
| `test_auth_service.py` | 认证服务 |
| `test_deployer.py` | SSH 部署 |
| `test_deps.py` | 依赖注入 |
| `test_git_sync.py` | Git 同步 |
| `test_integration.py` | 集成测试 |
| `test_jobs.py` | 作业管理 |
| `test_main.py` | 主应用 |
| `test_memory.py` | Memory Rule |
| `test_orchestrator_import.py` | Orchestrator 导入 |
| `test_orm.py` | ORM 模型 |
| `test_orm_extended.py` | ORM 扩展测试 |
| `test_redis.py` | Redis 客户端 |
| `test_report_parser.py` | 报告解析 |
| `test_reports.py` | 报告路由 |
| `test_resume.py` | 作业恢复 |
| `test_scheduler.py` | 调度器 |
| `test_schemas.py` | Pydantic Schema |
| `test_slots.py` | Slot 管理 |
| `test_sse.py` | SSE 通道 |
| `test_users.py` | 用户管理 |
| `test_vulnerabilities.py` | 漏洞管理 |
| `test_worker.py` | Worker 循环 |
| `test_worker_jobs.py` | Worker 作业 |

运行测试：

```bash
pytest backend/tests/ -v
```
