# 数据流

## 作业生命周期

一个扫描作业从创建到完成的完整数据流：

```
用户触发扫描
    │
    ▼
POST /api/jobs ──────────► FastAPI Jobs Router
    │                            │
    │                            ▼
    │                     创建 Job 记录 (DB)
    │                     为每个 C/C++ 文件创建 Task 记录
    │                            │
    │                            ▼
    │                     Redis LPUSH → job_queue
    │
    ▼
Worker (BRPOP job_queue)
    │
    ▼
Orchestrator 子进程启动
    │
    ├──► 对每个文件执行: nga run '<prompt>'
    │         │
    │         ├──► stdout → POST /api/slot/{slot}/push
    │         │                    │
    │         │                    ▼
    │         │              Redis PUBLISH → channel:worker_{id}_slot_{n}
    │         │                    │
    │         │                    ▼
    │         │              SSE handler → browser EventSource
    │         │
    │         └──► 生成 .md 报告到 reports/{timestamp}/
    │
    ▼
扫描完成
    │
    ├──► 解析漏洞报告 (report_parser.py)
    │         │
    │         ▼
    │    创建 Vulnerability 记录 (DB)
    │
    ├──► 更新 Job 状态 → completed (DB)
    │
    └──► 释放 Slot
```

## SSE 通道

系统支持两种 SSE 通道：

| 通道 | URL | 用途 |
|------|-----|------|
| Legacy | `GET /api/sse/{slot_id}` | 兼容旧版单 Worker 架构 |
| Worker-specific | `GET /api/sse/worker/{worker_id}/{slot_id}` | 多 Worker 架构，每个 Worker 有独立通道 |

前端在 NodeDetail 组件中为每个活跃 Slot 建立 EventSource 连接，实时渲染 ANSI 格式的日志输出。

## 漏洞处理流程

```
扫描完成 → 报告解析 → Vulnerability (open)
                              │
                ┌─────────────┼─────────────┐
                ▼                            ▼
          Accept                        Reject
                │                            │
                ▼                            ▼
    MemoryRule (positive,               MemoryRule (negative,
    pending approval)                   auto-active)
                │
                ▼
    Committer+ 审批
        │           │
        ▼           ▼
    approved     rejected
```

- **Accept** — 自动创建正向 Memory Rule（聚焦此类问题），需 committer+ 审批后生效
- **Reject** — 自动创建负向 Memory Rule（忽略此类误报），创建即生效

## Git 增量扫描流程

```
POST /api/jobs/{id}/git-sync
    │
    ▼
获取 HEAD commit hash
    │
    ▼
对比上次扫描的 commit → get_changes_since()
    │
    ▼
获取变更文件列表 + diff
    │
    ▼
仅扫描变更的 C/C++ 文件
    │
    ▼
节省约 78.4% 的 LLM 推理成本
```
