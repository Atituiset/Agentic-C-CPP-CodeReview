# Worker 引擎概览

Worker 引擎是 Combinate Agentic Review 的核心扫描执行层，负责调用 `nga` CLI 对 C/C++ 源文件进行 AI 代码审计。

## 架构

```
┌─────────────────────────────────────────────────┐
│              Worker (进程/节点)                    │
│                                                   │
│  ┌─────────────┐    ┌────────────────────────┐   │
│  │ Job Consumer │    │    Orchestrator        │   │
│  │ (Redis       │───►│  (nga CLI 编排器)      │   │
│  │  BRPOP)      │    │                        │   │
│  └─────────────┘    │  ┌──────┐ ┌──────┐     │   │
│                      │  │Slot 0│ │Slot 1│ ... │   │
│  ┌─────────────┐    │  │nga   │ │nga   │     │   │
│  │ Heartbeat    │    │  │sub   │ │sub   │     │   │
│  │ (30s interval│    │  │proc  │ │proc  │     │   │
│  └─────────────┘    └──┴──────┘ ┴──────┘─────┘   │
│                                                   │
│  ┌─────────────┐    ┌────────────────────────┐   │
│  │ Slot State   │    │  Skill / Knowledge     │   │
│  │ (in-memory)  │    │  (wireless-scan.yaml)  │   │
│  └─────────────┘    └────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## 两种部署模式

### 1. Local Worker Loop（内嵌模式）

- 运行在 FastAPI 进程内
- 通过 `backend/services/worker.py` 的 `worker_loop()` 函数
- 共享同一进程的内存和 Redis 连接
- 适合单机部署

### 2. Standalone Worker Node（独立模式）

- 通过 `worker_node.py` 独立运行
- 通过 HTTP API 向 Gateway 注册
- 每 30 秒发送心跳
- 通过 Redis 消费作业
- 适合分布式多机部署

两种模式共享相同的 Orchestrator 子进程调用逻辑。
