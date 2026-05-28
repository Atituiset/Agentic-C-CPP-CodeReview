# 认证与授权

## JWT 认证

后端使用 JWT (HS256) 进行身份认证：

1. `POST /api/auth/login` — 用户名+密码换取 Token
2. 后续请求携带 `Authorization: Bearer <token>`
3. Token 过期后需重新登录

**默认账户**: admin / admin123

## 角色体系

| 角色 | 说明 |
|------|------|
| admin | 系统管理员，拥有所有权限 |
| committer | 代码提交者，可审批 Memory Rule |
| user | 普通用户，可创建作业和管理自己的 Worker |

## 权限矩阵

| 操作 | admin | committer | user |
|------|-------|-----------|------|
| 查看所有 Worker | Y | N | N |
| 管理 Worker (CRUD) | Y | 仅自己 | 仅自己 |
| 部署 Worker | Y | 仅自己 | 仅自己 |
| 创建扫描作业 | Y | Y | Y |
| 取消/恢复作业 | Y | Y | 仅自己 |
| 查看所有漏洞 | Y | Y | Y |
| Accept/Reject 漏洞 | Y | Y | N |
| Assign 漏洞 | Y | Y | N |
| 创建 Personal Memory Rule | Y | Y | Y |
| 创建 Global Memory Rule | Y | Y | N |
| 审批 Memory Rule | Y | Y | N |
| 提交 Personal 为 Global | Y | Y | Y |
| 用户管理 CRUD | Y | N | N |
| 触发全局扫描 | Y | N | N |
| 获取 Deploy Key | Y | Y | Y |
| 管理 Schedule | Y | Y | 仅自己 |

## Worker 所有权隔离

Worker 模型有 owner_id 字段，实现所有权隔离：

- **user/committer** 只能查看和管理 owner_id 等于自己的 Worker
- **admin** 可查看所有 Worker
- 创建 Worker 时自动设置 owner_id 为当前用户
- 部署、删除、更新操作受所有权约束

## /finalize 端点特殊说明

`POST /api/jobs/{job_id}/finalize` 不要求 JWT 认证，因为它是被 Remote Agent 调用的。Agent 在扫描完成后通过此端点上报结果。Agent 本身通过 worker_id 标识身份。

> **安全考虑**: 未来版本可能增加 Agent Token 机制，为每个 Agent 分配独立的认证凭据。
