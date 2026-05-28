# API 路由

所有 API 路由定义于 `backend/routers/`，共 9 个模块。

## Auth (`/api/auth`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户名+密码登录，返回 JWT Token |
| GET | `/api/auth/me` | 获取当前用户信息 (需认证) |
| PUT | `/api/auth/me/show-thinking` | 切换当前用户的 show_thinking 偏好 |

## Jobs (`/api/jobs`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/jobs` | 创建扫描作业，推入 Redis 队列 |
| GET | `/api/jobs` | 列出所有作业 (按创建时间倒序) |
| GET | `/api/jobs/{job_id}` | 获取单个作业详情 |
| POST | `/api/jobs/{job_id}/progress` | Orchestrator 上报任务进度 |
| POST | `/api/jobs/{job_id}/complete` | Worker 上报作业完成 (含 Task 结果) |
| POST | `/api/jobs/{job_id}/finalize` | Agent 扫描完成回调：批量创建 Task/Vulnerability，写入报告文件 (无需认证) |
| POST | `/api/jobs/{job_id}/resume` | 从断点恢复中断/失败的作业 |
| POST | `/api/jobs/{job_id}/cancel` | 取消运行中或排队的作业 |
| GET | `/api/jobs/stats/git-sync` | 获取自上次全量扫描以来的 Git 变更统计 |
| GET | `/api/jobs/scheduler/status` | 获取调度器状态，可选 worker_id 查询参数 |

## Workers (`/api/workers`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/workers/{worker_id}/register` | Agent 自注册 (无需认证) |
| POST | `/api/workers/{worker_id}/heartbeat` | Agent 心跳上报 (无需认证) |
| GET | `/api/workers` | 列出 Worker (非 admin 按所有权过滤) |
| GET | `/api/workers/deploy-key` | 获取后端 SSH Deploy 公钥 |
| GET | `/api/workers/{worker_id}` | 获取单个 Worker 详情 (所有权校验) |
| PUT | `/api/workers/{worker_id}/show-thinking` | 切换 Worker 的 show_thinking |
| GET | `/api/workers/{worker_id}/git-status` | 获取 Worker Git 状态快照 |
| GET | `/api/workers/git-status/all` | 获取所有 Worker Git 状态 |
| GET | `/api/workers/{worker_id}/schedule` | 获取 Worker 定时扫描配置 |
| PUT | `/api/workers/{worker_id}/schedule` | 更新 Worker 定时扫描配置 |
| POST | `/api/workers` | 创建新 Worker (含 SSH 配置) |
| POST | `/api/workers/{worker_id}/deploy` | 触发 SSH 自动部署 (BackgroundTask) |
| GET | `/api/workers/{worker_id}/deploy-logs` | 获取部署日志 (JSON 数组) |
| PUT | `/api/workers/{worker_id}` | 更新 Worker 配置 |
| DELETE | `/api/workers/{worker_id}` | 删除 Worker 及关联数据 |

## SSE (`/api/sse`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sse/{slot_id}` | Slot 日志 SSE 流 (旧格式) |
| GET | `/api/sse/{worker_id}/{slot_id}` | Worker Slot 日志 SSE 流 (带 token 查询参数) |

## Slots (`/api/slot`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/slot/{worker_id}/{slot_id}/acquire` | 占用槽位 |
| POST | `/api/slot/{worker_id}/{slot_id}/push` | 推送日志到槽位 (Pub/Sub) |
| POST | `/api/slot/{worker_id}/{slot_id}/status` | 更新槽位状态 |
| POST | `/api/slot/{worker_id}/{slot_id}/release` | 释放槽位 |
| GET | `/api/slot/{worker_id}/status` | 获取 Worker 所有槽位状态 |

## Reports (`/api/reports`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/reports/{job_id}` | 获取作业报告文件列表 |
| GET | `/api/reports/{job_id}/{filepath:path}` | 获取单个报告文件内容 |

## Vulnerabilities (`/api/vulnerabilities`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/vulnerabilities` | 列出所有漏洞 (支持过滤) |
| GET | `/api/vulnerabilities/{vuln_id}` | 获取单个漏洞详情 |
| POST | `/api/vulnerabilities/{vuln_id}/accept` | 接受漏洞 (自动生成正向 Memory Rule) |
| POST | `/api/vulnerabilities/{vuln_id}/reject` | 拒绝漏洞 (自动生成负向 Memory Rule) |
| POST | `/api/vulnerabilities/{vuln_id}/assign` | 分配漏洞给处理人 |

## Memory Rules (`/api/memory-rules`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/memory-rules` | 列出 Memory Rule (支持 scope 过滤) |
| POST | `/api/memory-rules` | 创建 Memory Rule |
| POST | `/api/memory-rules/{rule_id}/approve` | 审批 Memory Rule (pending->active) |
| POST | `/api/memory-rules/{rule_id}/submit-global` | 提交个人规则为全局 |
| DELETE | `/api/memory-rules/{rule_id}` | 删除 Memory Rule |

## Users (`/api/users`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users` | 列出所有用户 (仅 admin) |
| POST | `/api/users` | 创建用户 (仅 admin) |
| DELETE | `/api/users/{user_id}` | 删除用户 (仅 admin) |
