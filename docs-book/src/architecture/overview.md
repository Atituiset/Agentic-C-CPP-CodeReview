# 整体架构

## 系统全景

Combinate Agentic Review 采用前后端分离 + 分布式 Worker 的架构：

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React SPA)                  │
│  ┌──────┐ ┌──────────┐ ┌────────┐ ┌──────┐ ┌────────┐ │
│  │Dash- │ │Worker    │ │Scan    │ │Vuln  │ │Memory  │ │
│  │board │ │Fleet     │ │Jobs    │ │Center│ │Manager │ │
│  └──┬───┘ └────┬─────┘ └───┬────┘ └──┬───┘ └───┬────┘ │
│     └──────────┴───────────┴─────────┴─────────┘      │
│                    REST API + SSE                       │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                  FastAPI Gateway                         │
│  ┌─────────┐ ┌─────────┐ ┌────────┐ ┌───────────────┐  │
│  │Auth     │ │Jobs     │ │Slots   │ │Vulnerabilities│  │
│  │Router   │ │Router   │ │Router  │ │Router         │  │
│  ├─────────┤ ├─────────┤ ├────────┤ ├───────────────┤  │
│  │Users    │ │Workers  │ │Memory  │ │SSE / Reports  │  │
│  │Router   │ │Router   │ │Router  │ │Router         │  │
│  └─────────┘ └─────────┘ └────────┘ └───────────────┘  │
│                                                         │
│  ┌──────────────────┐  ┌───────────────────────────┐   │
│  │  SQLAlchemy ORM  │  │     Redis Client          │   │
│  │  (SQLite)        │  │  (Pub/Sub + Job Queue)    │   │
│  └──────────────────┘  └───────────┬───────────────┘   │
└────────────────────────────────────┬────────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │         Redis Server            │
                    │   ┌──────────┐ ┌─────────────┐ │
                    │   │Pub/Sub   │ │Job Queue    │ │
                    │   │(logs/meta│ │(BRPOP/LPUSH)│ │
                    │   └──────────┘ └─────────────┘ │
                    └────────────────┬───────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
┌─────────▼──────────┐  ┌───────────▼─────────┐  ┌────────────▼───────┐
│  Local Worker Loop │  │  Worker Node A      │  │  Worker Node B     │
│  (in-process)      │  │  (worker_node.py)   │  │  (worker_node.py)  │
│                    │  │                     │  │                    │
│  ┌──────────────┐  │  │  ┌──────────────┐  │  │  ┌──────────────┐  │
│  │ Orchestrator │  │  │  │ Orchestrator │  │  │  │ Orchestrator │  │
│  │ (nga CLI)    │  │  │  │ (nga CLI)    │  │  │  │ (nga CLI)    │  │
│  │ 3 slots      │  │  │  │ 3 slots      │  │  │  │ 3 slots      │  │
│  └──────────────┘  │  │  └──────────────┘  │  │  └──────────────┘  │
└────────────────────┘  └─────────────────────┘  └────────────────────┘
```

## 关键设计决策

### 双 Worker 架构

系统支持两种 Worker 模式：

1. **Local Worker Loop** — 内嵌在 FastAPI 进程中，通过 `backend/services/worker.py` 的 `worker_loop()` 函数实现，直接从 Redis 队列消费作业
2. **Standalone Worker Node** — 通过 `worker_node.py` 独立运行，通过 HTTP API 注册、发送心跳，通过 Redis 消费作业

两种 Worker 共享相同的 Orchestrator 子进程调用逻辑，确保行为一致。

### Slot 并发模型

每个 Worker 拥有 3 个并发槽位（可配置），通过内存中的 `worker_slots` 字典管理：

- `acquire` — 占用槽位
- `push` — 推送日志/元数据
- `status` — 查询状态
- `release` — 释放槽位

### SSE 实时推送

Orchestrator 子进程的输出通过以下链路实时推送至浏览器：

```
Orchestrator stdout → POST /api/slot/{id}/push → Redis PUBLISH → SSE handler → browser EventSource
```
