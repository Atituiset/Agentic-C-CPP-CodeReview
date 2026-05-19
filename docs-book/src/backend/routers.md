# API 路由

## Jobs Router (`routers/jobs.py`)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/jobs` | 创建扫描作业 | admin/committer |
| GET | `/api/jobs` | 获取作业列表 | 认证用户 |
| GET | `/api/jobs/{id}` | 获取作业详情 | 认证用户 |
| POST | `/api/jobs/{id}/cancel` | 取消作业 | admin/committer |
| POST | `/api/jobs/{id}/resume` | 恢复已取消的作业 | admin/committer |
| POST | `/api/jobs/{id}/git-sync` | Git 增量同步 | admin/committer |

### 创建作业

```bash
curl -X POST http://localhost:8000/api/jobs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"repo_path": "/path/to/repo", "worker_id": "local"}'
```

### Git 增量同步

当调用 `git-sync` 时，系统对比当前 HEAD 与上次扫描的 commit，仅扫描变更的 C/C++ 文件，大幅降低 LLM 推理成本。

## SSE Router (`routers/sse.py`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sse/{slot_id}` | Legacy SSE 通道 |
| GET | `/api/sse/worker/{worker_id}/{slot_id}` | Worker 级 SSE 通道 |

SSE 连接订阅 Redis Pub/Sub 频道，将 Worker 日志实时推送至浏览器：

```
EventSource → /api/sse/worker/local/0 → Redis SUBSCRIBE worker_local_slot_0
```

## Slots Router (`routers/slots.py`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/slot/{worker_id}/{slot_id}/acquire` | 占用槽位 |
| POST | `/api/slot/{worker_id}/{slot_id}/push` | 推送日志/元数据 |
| GET | `/api/slot/{worker_id}/{slot_id}/status` | 查询槽位状态 |
| POST | `/api/slot/{worker_id}/{slot_id}/release` | 释放槽位 |
| GET | `/api/slot/{worker_id}/status` | 查询 Worker 所有槽位 |

## Workers Router (`routers/workers.py`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/workers/register` | 注册 Worker 节点 |
| POST | `/api/workers/{id}/heartbeat` | 心跳 |
| GET | `/api/workers` | 列出所有 Worker |
| GET | `/api/workers/{id}/git-status` | Git 状态 |
| PUT | `/api/workers/{id}/schedule` | 更新调度配置 |
| GET | `/api/workers/{id}/schedule` | 获取调度配置 |

## Reports Router (`routers/reports.py`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/reports/{job_id}` | 列出作业的所有报告文件 |
| GET | `/api/reports/{job_id}/{filename}` | 获取具体报告内容 |

## Auth Router (`routers/auth.py`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录获取 JWT |
| GET | `/api/auth/me` | 获取当前用户信息 |

## Users Router (`routers/users.py`)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/users` | 列出所有用户 | admin |
| POST | `/api/users` | 创建用户 | admin |
| DELETE | `/api/users/{id}` | 删除用户 | admin |

## Vulnerabilities Router (`routers/vulnerabilities.py`)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/vulnerabilities` | 列出漏洞（支持过滤） | 认证用户 |
| GET | `/api/vulnerabilities/{id}` | 获取漏洞详情 | 认证用户 |
| POST | `/api/vulnerabilities/{id}/accept` | 接受漏洞 | admin/committer |
| POST | `/api/vulnerabilities/{id}/reject` | 拒绝漏洞 | admin/committer |
| POST | `/api/vulnerabilities/{id}/assign` | 分配漏洞 | admin/committer |

### 接受漏洞的副作用

调用 `accept` 时，系统自动创建一条正向 Memory Rule（status=pending），需要 committer+ 审批后才生效。

### 拒绝漏洞的副作用

调用 `reject` 时，系统自动创建一条负向 Memory Rule（status=approved），立即生效，后续扫描将忽略此类误报。

## Memory Router (`routers/memory.py`)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/memory-rules` | 列出 Memory Rule | 认证用户 |
| POST | `/api/memory-rules` | 创建 Memory Rule | 认证用户 |
| POST | `/api/memory-rules/{id}/approve` | 审批 Memory Rule | admin/committer |
| DELETE | `/api/memory-rules/{id}` | 删除 Memory Rule | admin/committer |
