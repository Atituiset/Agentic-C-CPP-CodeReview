# 路线图

## Phase 1 — MVP ✅ (已完成)

- [x] FastAPI 后端 + React 前端
- [x] Redis 作业队列 + SSE 实时日志
- [x] Worker Slot 并发管理
- [x] Orchestrator (`nga` CLI) 子进程编排
- [x] 报告解析与漏洞提取
- [x] Dashboard 实时监控

## Phase 2 — 漏洞/Memory/用户管理 ✅ (已完成)

- [x] JWT 认证 + 角色权限体系
- [x] 漏洞生命周期管理 (open → accepted/rejected/assigned)
- [x] Memory Rule 知识库 (personal/global, positive/negative)
- [x] 用户管理 CRUD
- [x] 漏洞接受/拒绝自动生成 Memory Rule

## Phase 2+ — 增强功能 ✅ (已完成)

- [x] 分布式 Worker 集群 (独立 Worker Node)
- [x] APScheduler 定时扫描
- [x] Git 增量扫描
- [x] Worker 心跳与状态监控
- [x] NGA 报告格式解析
- [x] Worker Thinking 模式切换

## Phase 3 — 进行中 / 规划中

- [ ] Memory Rule 注入到 Orchestrator prompt
- [ ] 审计日志 (Audit Log)
- [ ] 项目 CRUD (多仓库管理)
- [ ] Worker 超时离线标记
- [ ] PostgreSQL 迁移
- [ ] CI/CD Webhook 集成
- [ ] 报告导出 (PDF/HTML)
- [ ] 漏洞趋势分析图表
- [ ] 批量漏洞操作
- [ ] API Rate Limiting
- [ ] WebSocket 替代 SSE
