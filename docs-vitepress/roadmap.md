# 路线图

## Phase 1 — MVP (已完成)

- [x] FastAPI 后端 + React 前端
- [x] Redis 作业队列 + SSE 实时日志
- [x] Worker Slot 并发管理
- [x] Orchestrator (nga CLI) 子进程编排
- [x] 报告解析与漏洞提取
- [x] Dashboard 实时监控

## Phase 2 — 漏洞/Memory/用户管理 (已完成)

- [x] JWT 认证 + 角色权限体系
- [x] 漏洞生命周期管理 (open -> accepted/rejected/assigned)
- [x] Memory Rule 知识库 (personal/global, positive/negative)
- [x] 用户管理 CRUD
- [x] 漏洞接受/拒绝自动生成 Memory Rule

## Phase 2+ — 增强功能 (已完成)

- [x] 分布式 Worker 集群 (独立 Worker Node)
- [x] APScheduler 定时扫描
- [x] Git 增量扫描
- [x] Worker 心跳与状态监控
- [x] NGA 报告格式解析
- [x] Worker Thinking 模式切换

## Phase 3 — 分布式与自动化 (已完成)

- [x] Dispatcher 调度循环 — 后端轮询 Redis 队列，HTTP 分发给 Agent
- [x] Remote Agent 常驻代理 — FastAPI 服务 (port 8765)，接收 /scan 指令
- [x] SSH 自动部署 (Deployer) — 10 步全自动部署 Agent 到远程机器
- [x] Deploy Key 管理 — Ed25519 密钥对自动生成
- [x] /finalize 端点 — Agent 批量上报结果
- [x] Worker 所有权隔离 — owner_id 驱动权限，MyWorkers 页面
- [x] 部署日志与状态追踪 — deploy_status、deploy_logs
- [x] 失败文件高亮 — 报告查看器红色标记 + 警告横幅
- [x] 作业断点续扫 — checkpoint 机制，Resume 恢复
- [x] 作业状态扩展 — dispatched / interrupted / resumed
- [x] Agent 心跳携带 Git 统计

## Phase 4 — 规划中

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
