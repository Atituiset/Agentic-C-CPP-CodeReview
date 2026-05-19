# Worker Node 独立节点

**`worker_node.py`** — 独立 Worker 节点启动脚本

## 概述

独立 Worker 节点可以在远程机器上运行，通过网络连接到 Gateway API 和 Redis，构成分布式扫描集群。

## 核心流程

```
启动 Worker Node
    │
    ▼
向 Gateway API 注册 (POST /api/workers/register)
    │
    ▼
获取 Worker ID
    │
    ├──► 心跳循环 (每 30s)
    │    POST /api/workers/{id}/heartbeat
    │
    ├──► 作业消费循环
    │    Redis BRPOP job_queue
    │         │
    │         ▼
    │    启动 Orchestrator 子进程
    │         │
    │         ▼
    │    报告解析 → 漏洞写入
    │         │
    │         ▼
    │    API 结果上报
    │
    └──► 思考模式切换 (可选)
         POST /api/workers/{id}/thinking-toggle
```

## 注册流程

```python
async def register_with_gateway():
    response = await httpx.post(f"{GATEWAY_URL}/api/workers/register", json={
        "hostname": socket.gethostname(),
        "ip_address": get_local_ip(),
        "slots_count": 3,
    })
    worker_id = response.json()["worker_id"]
    return worker_id
```

注册后 Gateway 为 Worker 分配唯一 ID，Worker 在后续心跳和作业处理中使用此 ID。

## 心跳机制

```python
async def heartbeat_loop(worker_id: str):
    while True:
        await httpx.post(
            f"{GATEWAY_URL}/api/workers/{worker_id}/heartbeat",
            json={"status": get_current_status()}
        )
        await asyncio.sleep(30)
```

心跳间隔 30 秒，携带 Worker 当前状态信息。

## 作业消费

```python
async def job_consumer_loop(worker_id: str):
    while True:
        job_data = await redis.brpop("job_queue", timeout=5)
        if job_data:
            # 1. 占用 Slot
            await acquire_slot(worker_id, slot_id)
            # 2. 运行 Orchestrator
            result = await run_orchestrator(job_data)
            # 3. 上报结果
            await report_results(worker_id, job_data, result)
            # 4. 释放 Slot
            await release_slot(worker_id, slot_id)
```

## Git 同步 (`worker/git_sync.py`)

Worker 级别的 Git 同步功能，与 `backend/services/git_sync.py` 功能镜像：

- `get_head_commit()` — 获取当前 HEAD
- `get_changes_since()` — 获取增量变更
- `get_all_cpp_files()` — 获取所有 C/C++ 文件
- `get_diff()` — 获取 diff 内容

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GATEWAY_URL` | `http://localhost:8000` | Gateway API 地址 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 地址 |
| `WORKER_SLOTS` | `3` | 并发槽位数 |
| `HEARTBEAT_INTERVAL` | `30` | 心跳间隔（秒） |

## 启动

```bash
# 基本启动
python3 worker_node.py

# 自定义 Gateway 和 Redis
GATEWAY_URL=http://gateway:8000 REDIS_URL=redis://redis:6379 python3 worker_node.py
```
