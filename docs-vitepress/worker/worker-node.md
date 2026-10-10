# Worker Node 独立节点

**`worker_node.py`** — 独立 Worker 节点启动脚本

## 概述

独立 Worker 节点在远程机器上运行，通过网络连接到 Gateway API 和 Redis，直接通过 Redis BRPOP 消费作业，无需后端 Dispatcher 中转。

## 核心流程

```
启动 Worker Node
│
▼
向 Gateway API 注册 (POST /api/workers/{id}/register)
│
├──► 心跳循环 (每 30s)
│    POST /api/workers/{id}/heartbeat
│
└──► 作业消费循环
     Redis BRPOP scan:job:queue
     │
     ▼
     启动 Orchestrator 子进程
     │
     ▼
     报告解析 → 漏洞写入
     │
     ▼
     API 结果上报
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GATEWAY_URL` | `http://localhost:8000` | Gateway API 地址 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 地址 |
| `WORKER_SLOTS` | `3` | 并发槽位数 |
| `HEARTBEAT_INTERVAL` | `30` | 心跳间隔 (秒) |

## 与 Remote Agent 的对比

| 特性 | Remote Agent | Worker Node |
|------|-------------|-------------|
| 部署方式 | SSH 自动部署 | 手动启动 |
| 作业接收 | HTTP POST /scan | Redis BRPOP |
| 配置文件 | config.json | 环境变量 |
| 需要后端 Dispatcher | 是 | 否 |
| 需要直连 Redis | 否 (可选) | 是 |
| 适合场景 | 托管式集群 | 自主管理节点 |
