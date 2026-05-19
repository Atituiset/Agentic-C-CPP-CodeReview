# 认证与授权

## 认证机制

系统使用 JWT (HS256) + bcrypt 进行认证：

1. 用户通过 `POST /api/auth/login` 提交用户名和密码
2. 服务端使用 bcrypt 验证密码哈希
3. 验证通过后签发 JWT Token（有效期 7 天）
4. 前端将 Token 存储在 `localStorage` 中
5. 后续请求通过 `Authorization: Bearer <token>` 头携带

### JWT Token 结构

```json
{
  "sub": "admin",
  "role": "admin",
  "exp": 1748000000
}
```

### 关键函数

| 函数 | 位置 | 说明 |
|------|------|------|
| `hash_password()` | `backend/services/auth_service.py` | bcrypt 哈希 |
| `verify_password()` | `backend/services/auth_service.py` | bcrypt 验证 |
| `create_access_token()` | `backend/services/auth_service.py` | JWT 签发 |
| `decode_token()` | `backend/services/auth_service.py` | JWT 解码验证 |
| `get_current_user()` | `backend/routers/auth.py` | FastAPI 依赖，从 Bearer Token 解析用户 |
| `require_role()` | `backend/routers/auth.py` | FastAPI 依赖，角色校验工厂函数 |

## 角色体系

| 角色 | 权限 |
|------|------|
| **admin** | 全部权限：用户管理、全局 Memory Rule 审批、扫描触发、漏洞管理 |
| **committer** | 漏洞管理、Memory Rule 审批、扫描触发 |
| **user** | 查看仪表盘、查看漏洞、创建个人 Memory Rule |

### 权限矩阵

| 功能 | admin | committer | user |
|------|-------|-----------|------|
| 查看仪表盘 | ✅ | ✅ | ✅ |
| 触发扫描 | ✅ | ✅ | ❌ |
| 查看漏洞 | ✅ | ✅ | ✅ |
| 接受/拒绝漏洞 | ✅ | ✅ | ❌ |
| 创建个人 Memory Rule | ✅ | ✅ | ✅ |
| 创建全局 Memory Rule | ✅ | ✅ | ❌ |
| 审批 Memory Rule | ✅ | ✅ | ❌ |
| 用户管理 CRUD | ✅ | ❌ | ❌ |
| Worker 管理 | ✅ | ✅ | ❌ |

## 前端认证流程

```tsx
// AuthContext.tsx
const login = async (username, password) => {
  const res = await api.post('/api/auth/login', { username, password });
  localStorage.setItem('token', res.data.access_token);
  setUser(await fetchMe());
};

// useApi.ts — 自动携带 Token
const headers = { Authorization: `Bearer ${token}` };
```

未认证时自动重定向至 LoginPage。
