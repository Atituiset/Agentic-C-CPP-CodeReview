# Remote Agent 常驻代理

**`worker/agent.py`** — 部署在远程扫描机器上的常驻 FastAPI 服务

## 概述

Remote Agent 是轻量级常驻服务，部署在远程 Worker 机器上，通过 HTTP 接收后端 Dispatcher 的扫描指令，启动 Orchestrator 子进程执行扫描，完成后通过 /finalize 端点上报结果。

与 Standalone Worker Node 不同，Agent 不直接消费 Redis 队列，而是被动等待后端 HTTP 调用。

## 架构

```
┌─────────────────────────────────────────────┐
│ Remote Machine                               │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ Agent (FastAPI, port 8765)             │  │
│  │  ├─ POST /scan   ← Dispatcher 调用    │  │
│  │  ├─ GET  /health                      │  │
│  │  └─ Heartbeat loop (30s) ──► Backend  │  │
│  └────────────┬───────────────────────────┘  │
│               │                              │
│  ┌────────────▼───────────────────────────┐  │
│  │ Orchestrator subprocess                │  │
│  │  ├─ python3 orchestrator.py --repo ... │  │
│  │  ├─ 3 concurrent slots (Semaphore)     │  │
│  │  └─ nga CLI per file                   │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ~/.opencode-agent/                          │
│  ├─ agent.py                                │
│  ├─ orchestrator.py                          │
│  ├─ worker/git_sync.py                       │
│  ├─ config.json                              │
│  └─ logs/                                    │
└─────────────────────────────────────────────┘
```

## 启动流程

1. 加载 `~/.opencode-agent/config.json` (必须包含 worker_id, backend_url, redis_url)
2. `on_startup` 事件：注册到后端 + 立即发送心跳 + 启动心跳循环
3. 监听端口 8765

## 核心端点

### POST /scan

接收扫描指令并启动 Orchestrator 子进程：

```json
{
  "job_id": "uuid",
  "repo_path": "/path/to/repo",
  "mode": "full|diff|files",
  "report_dir": "/tmp/opencode-reports/{job_id}",
  "file_paths": ["file1.c", "file2.cpp"],
  "target_commit": "abc123"
}
```

根据 mode 构建不同的 orchestrator 命令：

| mode | 命令 |
|------|------|
| full | `--full` |
| diff | `--diff <target_commit>` |
| files | `--files <path1> <path2> ...` |

### GET /health

```json
{"ok": true, "worker_id": "remote-01", "scanning": true}
```

## 心跳循环

每 30 秒发送心跳，携带本地 Git 统计信息：

```python
async def _heartbeat_loop():
    while True:
        await asyncio.sleep(30)
        status = "running" if _is_orchestrator_running() else "idle"
        git_stats = get_node_git_stats(REPO_PATH)
        payload = {
            "status": status,
            "current_job_id": _current_job_id,
            "head_commit": git_stats["head_commit"],
            "added_files": git_stats["added_files"],
            "modified_files": git_stats["modified_files"],
            "deleted_files": git_stats["deleted_files"],
            "changed_lines": git_stats["changed_lines"],
            "total_cpp_files": git_stats["total_cpp_files"],
        }
        # POST to /api/workers/{WORKER_ID}/heartbeat
```

## 扫描监控

`_monitor_scan()` 异步任务：

1. 轮询 proc.poll() 直到子进程结束
2. 遍历 report_dir/*.md，收集报告内容和日志
3. 调用 parse_vulnerability_report() 解析漏洞
4. POST /api/jobs/{job_id}/finalize 批量提交结果

## 配置文件

`~/.opencode-agent/config.json`：

```json
{
  "worker_id": "remote-01",
  "backend_url": "http://192.168.1.1:3000",
  "redis_url": "redis://192.168.1.1:6379/0",
  "repo_path": "/path/to/repo"
}
```

启动时验证 worker_id、backend_url、redis_url 三个必填项。
