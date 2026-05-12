# Agentic CodeReview 平台融合计划

## 1. 项目背景与目标

### 1.1 现有组件

| 项目 | 定位 | 技术栈 | 状态 |
|------|------|--------|------|
| Agentic-C-CPP-CodeReview | 看板/前端 Dashboard | React 19 + TS + Vite + Express | 功能完整，Mock 数据 |
| event-loop-agent | 执行器/扫描引擎 | Python 3 + FastAPI + asyncio | 功能完整，CLI 触发 |

### 1.2 融合目标

将两者融合为**企业级 Agentic CodeReview 平台**，实现：
- 前端看板可真实控制扫描任务执行
- 支持多 Worker 节点分布式扫描
- 支持多项目、多代码仓管理
- 数据持久化与审计追踪
- 支持 MR/PR 自动触发扫描

---

## 2. 现状分析

### 2.1 关键发现：API 协议天然兼容

两个项目的 Slot 管理协议几乎完全一致：

| 操作 | 看板端点 | 执行器端点 | 匹配度 |
|------|----------|-----------|--------|
| 获取 Slot | `GET /api/sse/:slot_id` | `GET /sse/:slot_id` | 一致 |
| 分配任务 | `POST /api/slot/:id/acquire` | `POST /api/slot/:id/acquire` | 完全一致 |
| 推送日志 | `POST /api/slot/:id/push` | `POST /api/slot/:id/push` | 完全一致 |
| 更新状态 | `POST /api/slot/:id/status` | `POST /api/slot/:id/status` | 完全一致 |
| 释放 Slot | `POST /api/slot/:id/release` | `POST /api/slot/:id/release` | 完全一致 |

**结论**：融合的核心工作量不在协议适配，而在**架构升级**（从单机 CLI 到分布式服务）。

### 2.2 能力互补矩阵

| 能力 | 看板 | 执行器 | 融合后 |
|------|------|--------|--------|
| 可视化 Dashboard | 有（企业级 UI） | 无（只有 Debug 页面） | 复用看板 |
| 实时日志流 | 有（SSE + ANSI 渲染） | 有（HTTP Push） | 复用看板 |
| 并发扫描调度 | 无（前端模拟） | 有（Semaphore + 进程管理） | 复用执行器 |
| 报告生成 | 无 | 有（Markdown + 日志） | 复用执行器 |
| 任务队列 | 无 | 无 | 需新增 |
| 数据持久化 | 无（Mock） | 无（文件系统） | 需新增 |
| 多 Worker 管理 | 无（Mock 节点） | 无 | 需新增 |

---

## 3. 目标架构

### 3.1 整体架构图

```
                              User / CI System
                                   |
            ┌──────────────────────┼──────────────────────┐
            |                      |                      |
            ▼                      ▼                      ▼
    ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
    │  Web Dashboard │     │   CLI Tool    │     │ GitLab/GitHub │
    │   (React SPA)  │     │  (未来扩展)    │     │    Webhook    │
    └───────┬───────┘     └───────────────┘     └───────────────┘
            |
            ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    API Gateway (FastAPI)                     │
    │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
    │  │ /api/jobs│ │/api/sse  │ │/api/fleet│ │/api/vulns│       │
    │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
    └───────────────────────────┬─────────────────────────────────┘
                                |
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │  PostgreSQL  │  │    Redis     │  │  Object Store│
    │  (任务/漏洞)  │  │(队列/缓存/SSE)│  │  (报告文件)   │
    └──────────────┘  └──────────────┘  └──────────────┘
                                |
                                ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    Task Scheduler (Python)                   │
    │  - 从 Redis 队列消费任务                                      │
    │  - 根据 Worker 负载选择目标节点                                │
    │  - 聚合扫描结果写入 PostgreSQL                                │
    └───────────────────────────┬─────────────────────────────────┘
                                |
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │   Worker 1   │  │   Worker 2   │  │   Worker N   │
    │  (orchestrator│  │  (orchestrator│  │  (orchestrator│
    │   3 slots)   │  │   3 slots)   │  │   3 slots)   │
    └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
           │                 │                 │
           ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │  nga x 3     │  │  nga x 3     │  │  nga x 3     │
    │ (OpenCode    │  │ (OpenCode    │  │ (OpenCode    │
    │   Agent)     │  │   Agent)     │  │   Agent)     │
    └──────────────┘  └──────────────┘  └──────────────┘
```

### 3.2 组件职责

| 组件 | 技术选型 | 职责 |
|------|----------|------|
| Web Dashboard | React 19 + Vite (复用) | 用户界面：Dashboard、Fleet、Jobs、Vulns |
| API Gateway | FastAPI (复用/增强 web_server.py) | HTTP API、SSE 流、静态文件服务 |
| Task Scheduler | Python asyncio (复用 orchestrator.py) | 任务调度、Worker 管理、结果聚合 |
| Worker Node | Python subprocess (复用 orchestrator.py) | 本地 nga 进程管理、扫描执行 |
| PostgreSQL | PostgreSQL 15+ | 任务、漏洞、Worker、项目、用户数据持久化 |
| Redis | Redis 7+ | 任务队列、实时日志流、状态缓存 |
| Object Store | MinIO / S3 | Markdown 报告、日志文件长期存储 |

---

## 4. 数据模型设计

### 4.1 核心实体

```sql
-- 项目/代码仓
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    repo_url VARCHAR(512) NOT NULL,
    repo_type VARCHAR(32) CHECK (repo_type IN ('gitlab', 'github', 'gitea')),
    default_branch VARCHAR(64) DEFAULT 'main',
    webhook_secret VARCHAR(256),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 扫描任务
CREATE TABLE scan_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    job_type VARCHAR(32) CHECK (job_type IN ('diff', 'full', 'files')),
    trigger_type VARCHAR(32) CHECK (trigger_type IN ('manual', 'webhook', 'scheduled')),
    status VARCHAR(32) DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled')),
    target_commit VARCHAR(64),
    base_commit VARCHAR(64),
    file_paths TEXT[],
    total_files INT DEFAULT 0,
    completed_files INT DEFAULT 0,
    failed_files INT DEFAULT 0,
    sast_findings INT DEFAULT 0,
    llm_findings INT DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds FLOAT,
    report_url VARCHAR(512),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Worker 节点
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id VARCHAR(128) UNIQUE NOT NULL,
    hostname VARCHAR(256),
    ip_address INET,
    region VARCHAR(64),
    slots_total INT DEFAULT 3,
    slots_busy INT DEFAULT 0,
    status VARCHAR(32) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy', 'error')),
    last_heartbeat TIMESTAMPTZ,
    version VARCHAR(32),
    labels JSONB,
    registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- 子任务（单个文件扫描）
CREATE TABLE scan_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES scan_jobs(id),
    worker_id UUID REFERENCES workers(id),
    slot_id INT,
    file_path VARCHAR(512) NOT NULL,
    task_seq INT NOT NULL,
    status VARCHAR(32) DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds FLOAT,
    report_url VARCHAR(512),
    log_url VARCHAR(512),
    stdout TEXT,
    stderr TEXT,
    error_message TEXT,
    return_code INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 漏洞发现
CREATE TABLE vulnerabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES scan_jobs(id),
    task_id UUID REFERENCES scan_tasks(id),
    project_id UUID REFERENCES projects(id),
    rule_id VARCHAR(32),
    severity VARCHAR(16) CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    file_path VARCHAR(512),
    line_start INT,
    line_end INT,
    title VARCHAR(256),
    description TEXT,
    code_snippet TEXT,
    fix_suggestion TEXT,
    confidence FLOAT CHECK (confidence BETWEEN 0 AND 1),
    analyzer VARCHAR(32) CHECK (analyzer IN ('semgrep', 'codeql', 'clang', 'nga_llm')),
    status VARCHAR(32) DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'fixed', 'false_positive', 'wont_fix')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 实时日志（仅保留最近 7 天，配合 Redis Stream）
CREATE TABLE scan_logs (
    id BIGSERIAL PRIMARY KEY,
    task_id UUID REFERENCES scan_tasks(id),
    slot_id INT,
    log_type VARCHAR(16) CHECK (log_type IN ('stdout', 'stderr', 'meta')),
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_scan_logs_task_time ON scan_logs(task_id, created_at DESC);
```

---

## 5. 实施路线图

### 阶段 1：最小可行融合（MVP）—— 2 周

目标：让看板能真实控制执行器，完成一次端到端扫描。

#### Week 1：协议打通

| 任务 | 说明 | 关键文件 |
|------|------|----------|
| T1.1 统一后端服务 | 用 FastAPI 替换 Express，serve React 静态文件 | 新增 `backend/main.py` |
| T1.2 封装 Orchestrator | 将 `orchestrator.py` 改造为可被 import 的模块，保留 CLI 兼容 | 修改 `orchestrator.py` |
| T1.3 Job 提交 API | `POST /api/jobs` 接收扫描参数，同步返回 job_id | 新增 `backend/routers/jobs.py` |
| T1.4 SSE 桥接 | 将 orchestrator 的 HTTP Push 转为 Redis Stream，Gateway 消费后 SSE 推送 | 修改 `web_server.py` |

#### Week 2：前端接入

| 任务 | 说明 | 关键文件 |
|------|------|----------|
| T1.5 Jobs Queue 真实化 | 前端调用 `/api/jobs` 获取真实任务列表 | 修改 `src/App.tsx` |
| T1.6 扫描触发 | "Trigger Global MR Scan" 按钮调用真实 API | 修改 `src/App.tsx` |
| T1.7 报告展示 | 扫描完成后前端展示 Markdown 报告 | 新增 ReportViewer 组件 |
| T1.8 端到端测试 | 验证：提交任务 -> 执行器运行 -> SSE 实时更新 -> 报告生成 | 集成测试 |

**阶段 1 交付物**：
- 一个命令启动完整系统（`docker-compose up`）
- 支持手动提交文件列表/Diff 扫描
- 前端实时查看 3-slot 执行过程
- 扫描报告可下载

---

### 阶段 2：企业级基础 —— 3 周

目标：多 Worker、多项目、数据持久化。

#### Week 3：数据层

| 任务 | 说明 |
|------|------|
| T2.1 PostgreSQL 集成 | SQLAlchemy 模型 + Alembic 迁移 |
| T2.2 Redis 队列 | Celery / RQ / 自研轻量队列，消费 scan_jobs |
| T2.3 报告对象存储 | 支持本地文件系统 / MinIO / S3 |
| T2.4 审计日志 | 所有 API 操作记录 |

#### Week 4：Worker 管理

| 任务 | 说明 |
|------|------|
| T2.5 Worker 注册协议 | Worker 启动时向 Scheduler 注册，定期心跳 |
| T2.6 负载均衡 | Scheduler 根据 Worker 负载（slots_busy / 网络延迟）分配任务 |
| T2.7 Worker Fleet 真实化 | 前端从数据库读取真实 Worker 状态 |
| T2.8 Worker 健康检查 | 心跳超时自动标记离线，任务重新调度 |

#### Week 5：项目管理

| 任务 | 说明 |
|------|------|
| T2.9 项目 CRUD | 前端管理项目（Repo URL、分支、关注路径） |
| T2.10 Diff 模式增强 | 支持选择 base commit，自动提取变更文件 |
| T2.11 漏洞入库 | 解析 Markdown 报告，提取结构化漏洞数据 |
| T2.12 Vulnerability Center 真实化 | 前端展示数据库中的漏洞列表 |

**阶段 2 交付物**：
- 支持注册多个 Worker 节点
- 支持多个代码仓项目
- 扫描历史可查询
- 漏洞可追踪状态

---

### 阶段 3：高级特性 —— 4 周

#### Week 6：CI/CD 集成

| 任务 | 说明 |
|------|------|
| T3.1 GitLab Webhook | MR 创建/更新时自动触发 Diff 扫描 |
| T3.2 GitHub Webhook | PR 创建/更新时自动触发扫描 |
| T3.3 MR 评论回写 | 扫描结果以评论形式回写到 MR/PR |
| T3.4 扫描状态徽章 | 提供 SVG 徽章供 README 展示 |

#### Week 7：规则引擎

| 任务 | 说明 |
|------|------|
| T3.5 规则管理 UI | 前端管理 `skills/` 目录下的规则文件 |
| T3.6 规则版本控制 | 规则变更历史、回滚 |
| T3.7 自定义规则 | 用户可新增项目专属规则 |
| T3.8 规则效果分析 | 统计每条规则的检出率、误报率 |

#### Week 8：协作与追踪

| 任务 | 说明 |
|------|------|
| T3.9 JIRA 集成 | 漏洞一键创建 JIRA Issue |
| T3.10 飞书/钉钉通知 | 扫描完成/发现 Critical 漏洞时通知 |
| T3.11 漏洞指派 | 支持指派给特定开发者 |
| T3.12 修复验证 | 修复后重新扫描验证 |

#### Week 9：安全与运维

| 任务 | 说明 |
|------|------|
| T3.13 用户认证 | JWT / OAuth2 / SSO 集成 |
| T3.14 权限控制 | RBAC：管理员/项目管理员/开发者/只读 |
| T3.15 速率限制 | API 限流、扫描频率控制 |
| T3.16 监控告警 | Prometheus metrics + Grafana dashboard |

**阶段 3 交付物**：
- 完整的 CI/CD 集成能力
- 可自定义规则集
- 漏洞闭环管理
- 企业级安全与运维

---

## 6. 技术决策记录

### 6.1 为什么选择 FastAPI 而非 Express 作为 Gateway？

| 维度 | Express (Node.js) | FastAPI (Python) | 结论 |
|------|-------------------|------------------|------|
| SSE 支持 | 需额外库 | 原生 asyncio 支持 | FastAPI 胜出 |
| 与执行器协同 | 需额外进程通信 | 可直接 import orchestrator | FastAPI 胜出 |
| 性能 | 高 | 高（uvicorn + starlette） | 持平 |
| 团队熟悉度 | 前端团队熟悉 | 执行器团队熟悉 | 持平 |
| 生态 | npm 丰富 | Python ML/AI 生态强 | FastAPI 胜出 |

### 6.2 任务队列选型：Redis Stream vs Celery vs RQ

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **Redis Stream** (推荐) | 轻量、支持消费者组、天然支持 SSE | 需自研重试/死信 | 我们的场景足够 |
| Celery | 功能全、生态成熟 | 重量级、依赖多 | 超大规模 |
| RQ | 简单、Pythonic | 功能少、无消费者组 | 小规模 |

**决策**：阶段 1~2 使用 Redis Stream，阶段 3 如需更复杂调度再考虑 Celery。

### 6.3 Worker 通信协议

| 方案 | 优点 | 缺点 |
|------|------|------|
| HTTP (推荐) | 简单、穿透性好、易调试 | 有延迟 |
| gRPC | 性能高、类型安全 | 需 protobuf、复杂 |
| Message Queue | 解耦、可靠 | 需额外组件 |

**决策**：Worker 与 Scheduler 之间用 HTTP（已有基础），Scheduler 与 Gateway 之间用 Redis Stream。

---

## 7. 目录结构规划

```
agentic-codereview-platform/          # 融合后的统一仓库
├── docker-compose.yml                # 一键启动完整系统
├── Dockerfile.backend
├── Dockerfile.frontend
├── Dockerfile.worker
│
├── frontend/                         # Agentic-C-CPP-CodeReview 迁移
│   ├── src/
│   │   ├── App.tsx                   # 主入口（需改造）
│   │   ├── components/
│   │   │   ├── Dashboard/
│   │   │   ├── Fleet/
│   │   │   ├── JobsQueue/
│   │   │   ├── VulnerabilityCenter/
│   │   │   └── NodeDetail/
│   │   ├── hooks/
│   │   │   ├── useSSE.ts             # SSE 连接管理
│   │   │   └── useApi.ts             # API 调用
│   │   └── types/
│   │       └── index.ts              # TypeScript 类型定义
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                          # 新增：统一后端
│   ├── main.py                       # FastAPI 应用入口
│   ├── config.py                     # 配置管理
│   ├── database.py                   # SQLAlchemy 连接
│   ├── redis_client.py               # Redis 连接
│   ├── routers/
│   │   ├── jobs.py                   # 任务管理 API
│   │   ├── workers.py                # Worker 管理 API
│   │   ├── vulns.py                  # 漏洞管理 API
│   │   ├── projects.py               # 项目管理 API
│   │   ├── sse.py                    # SSE 流端点
│   │   └── webhooks.py               # Webhook 接收
│   ├── services/
│   │   ├── scheduler.py              # 任务调度器
│   │   ├── report_parser.py          # 报告解析
│   │   └── notifier.py               # 通知服务
│   └── models/
│       └── schemas.py                # Pydantic / SQLAlchemy 模型
│
├── worker/                           # event-loop-agent 迁移改造
│   ├── orchestrator.py               # 核心调度器（复用改造）
│   ├── worker_daemon.py              # Worker 常驻守护进程（新增）
│   ├── slot_manager.py               # Slot 管理（从 orchestrator 抽取）
│   ├── skills/                       # 扫描规则
│   │   ├── wireless-scan.yaml
│   │   └── ...
│   ├── knowledge/                    # 知识库
│   │   └── ...
│   └── requirements.txt
│
├── shared/                           # 前后端共享定义
│   └── proto/
│       └── types.ts                  # 共享类型（可选）
│
├── docs/                             # 文档
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   └── API.md
│
└── scripts/                          # 运维脚本
    ├── init-db.sql
    └── migrate.sh
```

---

## 8. 风险与应对

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| nga 进程残留导致并发锁死 | 高 | 中 | 阶段 1 完善 `_cleanup_children` + 心跳监控 |
| SSE 连接在大量日志时性能下降 | 中 | 中 | 日志分页 + 前端虚拟滚动 + 大日志转文件 |
| Worker 节点网络不稳定 | 高 | 高 | 任务超时重试 + 死信队列 + 状态持久化 |
| 单 Worker 3-slot 瓶颈 | 中 | 中 | 阶段 2 水平扩展，单节点可增加 slot（需评估 nga 并发限制） |
| 报告解析不准确 | 中 | 中 | 结构化输出（JSON mode）+ 人工校验闭环 |

---

## 9. 下一步行动

1. **确认架构方案**：本计划是否需要调整？
2. **启动阶段 1**：先实现最小可行融合，验证技术可行性
3. **基础设施准备**：Docker Compose 环境（PostgreSQL + Redis + MinIO）
4. **代码仓库重组**：将两个项目按上述目录结构合并到一个仓库

---

*文档版本: v1.0*
*创建日期: 2026-05-12*
*状态: 待评审*
