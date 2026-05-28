# Worker 引擎

Worker 扫描引擎的详细文档，包括 Remote Agent、SSH 部署、Orchestrator 编排器、独立 Worker 节点和技能知识库。

请从左侧导航选择具体章节：

- [Remote Agent 常驻代理](./agent.md) — FastAPI 服务 (port 8765)、/scan、心跳、报告上报
- [SSH 部署服务](./deployer.md) — 10 步自动部署流程、Deploy Key 管理、部署日志
- [Orchestrator 编排器](./orchestrator.md) — CLI 接口、并发控制、动态超时、断点续扫、报告生成
- [Worker Node 独立节点](./worker-node.md) — 注册、心跳、Redis BRPOP 作业消费、Git 同步
- [技能与知识库](./skills.md) — 10 条扫描规则、领域知识、Memory Rule 反馈闭环
