# Combinate Agentic Review

**AI 驱动的无线通信系统代码安全审计平台**

## 项目定位

Combinate Agentic Review 是一个面向无线通信系统（4G/5G RRC/MAC/NAS 协议栈）的 C/C++ 代码安全审计平台。它将 LLM Agent（通过 `nga` CLI）与分布式 Worker 集群相结合，实现自动化的低错问题扫描、漏洞管理和知识沉淀。

## 核心特性

- **分布式扫描集群** — Dispatcher + Remote Agent 架构，支持 SSH 一键自动部署 Agent 到远程机器
- **AI Agent 编排** — Orchestrator 管理并发扫描槽位，动态超时，断点续扫
- **漏洞生命周期** — 自动提取 → Accept/Reject → 生成 Memory Rule 知识闭环
- **增量扫描** — Git diff 驱动，仅扫描变更文件，节省 LLM 推理成本
- **实时监控** — SSE 实时日志流，Worker 心跳与 Git 统计上报
- **角色权限** — JWT + 三级角色 (admin/committer/user)，Worker 所有权隔离
- **SSH Deploy Key** — Ed25519 密钥对自动生成，前端获取公钥添加到远程机器
- **失败文件高亮** — 报告查看器中红色标记扫描失败文件
- **断点续扫** — 作业中断后可 Resume，跳过已完成文件继续扫描

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | FastAPI + SQLAlchemy + Redis + APScheduler |
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS |
| Worker | Python asyncio + `nga` CLI + asyncssh |
| 数据库 | SQLite (开发) / PostgreSQL (规划) |
| 部署 | Docker Compose / SSH 自动部署 |

## 快速开始

请阅读 [快速开始](./quickstart.md) 了解如何启动和部署。

## 文档导航

- [系统架构](./architecture/overview.md) — 整体设计、Dispatcher + Agent 双 Worker 架构
- [后端](./backend/overview.md) — FastAPI API 路由、核心服务
- [前端](./frontend/overview.md) — React 组件、API 集成
- [Worker 引擎](./worker/agent.md) — Agent、Deployer、Orchestrator、技能知识库
- [部署](./deployment/docker.md) — Docker 部署、GitHub Pages
- [路线图](./roadmap.md) — 开发进度与未来规划
