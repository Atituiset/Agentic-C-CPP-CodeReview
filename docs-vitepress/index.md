---
layout: home

hero:
  name: Combinate
  text: Agentic Review
  tagline: 面向大规模 C/C++ 系统的 AI 驱动代码安全审计平台——LLM Agent 与分布式 Worker 集群结合，实现自动化漏洞扫描、漏洞管理与知识沉淀
  actions:
    - theme: brand
      text: 开始阅读
      link: /intro
    - theme: alt
      text: 快速开始
      link: /quickstart
    - theme: alt
      text: 系统架构
      link: /architecture/overview

features:
  - title: 系统架构
    details: 整体设计、Dispatcher + Agent 双 Worker 架构、数据流、数据库模型与认证授权机制。
    link: /architecture/
  - title: 后端
    details: FastAPI + SQLAlchemy + Redis + APScheduler：API 路由、核心服务与配置基础设施。
    link: /backend/
  - title: 前端
    details: React 19 + TypeScript + Vite + Tailwind CSS：组件结构、状态管理与 API 集成。
    link: /frontend/
  - title: Worker 引擎
    details: Remote Agent、SSH 自动部署、Orchestrator 并发编排、断点续扫与技能知识库。
    link: /worker/
  - title: 部署
    details: Docker Compose 一键部署、SSH Deploy Key 自动分发、GitHub Pages 文档站点。
    link: /deployment/
  - title: 路线图
    details: 开发进度与未来规划：增量扫描、漏洞生命周期、Memory Rule 知识闭环。
    link: /roadmap
---
