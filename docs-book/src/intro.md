# Combinate Agentic Review

**企业级 C/C++ 仓库 AI 自动化代码审计平台**

![Dashboard 截图](./images/dashboard-main.png)

## 项目定位

Combinate Agentic Review 是一个融合了两个先前项目的 AI 代码审计平台：

- **Agentic-C-CPP-CodeReview** — React 仪表盘，用于展示代码审计结果
- **event-loop-agent** — Python 扫描引擎，使用 `nga` (OpenCode Agent) CLI 对 C/C++ 仓库进行并行逐文件 AI 代码审计

用户触发扫描后，系统以 3 个并发槽位并行运行 `nga` 对每个文件进行 AI 审计，漏洞从 Markdown 报告中解析，并提供完整的接受/拒绝工作流以及 Memory Rule 知识库反馈到后续扫描中。

## 核心特性

- **分布式 Worker 集群** — 支持本地内嵌 Worker 和独立远程 Worker 节点
- **实时 SSE 日志流** — 扫描过程实时推送至浏览器
- **漏洞生命周期管理** — 接受/拒绝/分配，自动生成 Memory Rule
- **Memory Rule 知识库** — 正向（聚焦）与负向（忽略）规则，个人/全局级别
- **基于角色的访问控制** — admin / committer / user 三级权限
- **定时调度扫描** — APScheduler 支持 cron 表达式每日定时扫描
- **Git 增量扫描** — 基于 commit diff 的增量审计，节省 LLM 推理成本约 78.4%

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | FastAPI + SQLAlchemy + SQLite + Redis |
| 前端 | Vite + React 19 + TypeScript + Tailwind CSS |
| Worker | Python 编排器 + `nga` CLI 子进程 |
| 基础设施 | Docker Compose (Redis + App) |
