# Agentic CodeReview 平台 — 功能实现分析

> 分析日期: 2026-05-19
> 分析基准: FUSION_PLAN.md 三阶段规划

## 1. 项目定位

这是一个**企业级 Agentic 代码审查平台**，由两个独立项目融合而来：

- **Agentic-C-CPP-CodeReview**（React 看板/前端 Dashboard）
- **event-loop-agent**（Python 扫描执行器/orchestrator）

核心功能：对 C/C++ 代码仓进行**自动化 AI 审查**，通过 `nga`（OpenCode Agent）并行扫描文件，生成漏洞报告。

## 2. 已实现功能 vs 计划对照

### 阶段 1 — 最小可行融合 (MVP) ✅ 已完成

| 任务 | 状态 | 说明 |
|------|------|------|
| T1.1 统一后端服务 | ✅ | `backend/main.py` — FastAPI 替代了 Express |
| T1.2 封装 Orchestrator | ✅ | `worker/orchestrator.py` 保留 CLI 兼容 + `create_orchestrator()` 工厂函数 |
| T1.3 Job 提交 API | ✅ | `POST /api/jobs` + Redis 队列 `scan:job:queue` |
| T1.4 SSE 桥接 | ✅ | Redis Pub/Sub → SSE 推送，支持 legacy + worker-specific 双通道 |
| T1.5 Jobs Queue 真实化 | ✅ | `ScanJobsQueue.tsx` 调用真实 API |
| T1.6 扫描触发 | ✅ | "Trigger Global MR Scan" 按钮调用 `createJob` |
| T1.7 报告展示 | ✅ | `ReportViewer.tsx` + `GET /api/reports/{job_id}` |
| T1.8 端到端测试 | ⚠️ | 有集成测试但 Redis 依赖导致失败 |

### 阶段 2 — 企业级基础 ⚠️ 部分完成

| 任务 | 状态 | 说明 |
|------|------|------|
| T2.1 数据持久化 | ✅ 部分 | 使用 SQLite（非计划中的 PostgreSQL），ORM 模型完整 |
| T2.2 Redis 队列 | ✅ | LPUSH/BRPOP 简易队列，非 Celery/RQ |
| T2.3 报告对象存储 | ✅ 部分 | 本地文件系统（`reports/` 目录），无 MinIO/S3 |
| T2.4 审计日志 | ❌ | 无审计日志 API |
| T2.5 Worker 注册协议 | ✅ | `POST /api/workers/{id}/register` + 心跳 |
| T2.6 负载均衡 | ⚠️ 部分 | 有心跳机制，但 Scheduler 未实现按负载分配任务，所有 worker 竞争同一队列 |
| T2.7 Worker Fleet 真实化 | ✅ | `WorkerFleet.tsx` 展示真实 Worker 状态 |
| T2.8 Worker 健康检查 | ⚠️ 部分 | 心跳更新有实现，但**无超时自动标记离线**逻辑 |
| T2.9 项目 CRUD | ❌ | 无 `projects` 表、无项目路由/前端 |
| T2.10 Diff 模式增强 | ✅ | `git_sync.py` 完整实现，支持 base commit 对比 |
| T2.11 漏洞入库 | ✅ | `report_parser.py` 解析 NGA/VULN 格式报告 → `Vulnerability` 表 |
| T2.12 Vulnerability Center | ✅ | 前端 `VulnerabilityCenter.tsx` + 后端 CRUD（accept/reject/assign） |

**额外实现（计划外）：**

- ✅ **用户认证**：JWT + bcrypt，角色（admin/committer/user）
- ✅ **Memory Rules**：个人/全局规则管理，提交全局审批流程
- ✅ **Per-Worker 定时调度**：APScheduler 按每个 worker 配置扫描/停止时间
- ✅ **Per-Worker Git 状态**：`WorkerGitStatus` 模型 + API
- ✅ **任务断点续扫**：`checkpoint.json` + resume job
- ✅ **Standalone Worker Node**：`worker_node.py` 可独立部署到远程机器
- ✅ **Thinking 过滤**：用户/worker 级别控制是否显示 AI 推理过程

### 阶段 3 — 高级特性 ❌ 基本未实现

| 任务 | 状态 | 说明 |
|------|------|------|
| T3.1 GitLab Webhook | ❌ | |
| T3.2 GitHub Webhook | ❌ | |
| T3.3 MR 评论回写 | ❌ | |
| T3.4 扫描状态徽章 | ❌ | |
| T3.5-T3.8 规则引擎 UI | ⚠️ | Memory Rules 是简化版规则管理 |
| T3.9 JIRA 集成 | ❌ | |
| T3.10 飞书/钉钉通知 | ❌ | |
| T3.11 漏洞指派 | ✅ | `assign` API 已实现 |
| T3.12 修复验证 | ❌ | |
| T3.13 用户认证 | ✅ | JWT + bcrypt |
| T3.14 权限控制 | ✅ 部分 | RBAC 3 角色，但无项目管理员角色 |
| T3.15 速率限制 | ❌ | |
| T3.16 监控告警 | ❌ | |

## 3. 测试状况

- **70 通过 / 15 失败 / 4 错误**
- 主要失败原因：
  1. **Redis 不可用**（本地无 Redis 实例）— 影响 10+ 测试
  2. **ORM 自引用外键** — `User.created_by` 在 `User` 表上导致循环引用错误
  3. **SSE 签名变更** — `event_generator()` 参数不匹配（加了 `worker_id` 但测试未更新）

## 4. 架构偏差（vs 计划）

1. **数据库**：计划 PostgreSQL，实际 SQLite — 适合单机，不适合多节点生产
2. **对象存储**：计划 MinIO/S3，实际本地文件系统 — 报告目录在本地
3. **任务调度**：计划"Scheduler 根据 Worker 负载选择目标节点"，实际是**所有 Worker 竞争同一 Redis 队列**（BRPOP），无智能调度
4. **项目管理**：计划 `projects` 表 + CRUD，实际未实现
5. **审计日志**：完全缺失

## 5. 整体完成度

| 阶段 | 完成度 |
|------|--------|
| 阶段 1 MVP | **~95%** — 核心流程完整，端到端测试需修复 |
| 阶段 2 企业级 | **~60%** — Worker/漏洞/用户/调度已实现，缺项目管理和健康检查，存储降级 |
| 阶段 3 高级特性 | **~15%** — 仅用户认证+权限+漏洞指派完成，CI/CD 集成/通知/监控均未做 |

**最核心的功能链**（提交任务 → 调度 → 扫描 → 报告 → 漏洞追踪）**已完整打通**，可作为单机 MVP 运行。但距离"企业级多项目分布式平台"的完整目标，还缺项目管理、智能调度、CI/CD 集成、生产级存储等关键模块。
