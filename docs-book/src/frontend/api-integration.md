# 状态管理与 API 集成

## Auth Context (`context/AuthContext.tsx`)

应用级认证状态管理：

```tsx
interface AuthContextType {
  user: MeResponse | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}
```

- 登录成功后将 JWT Token 存储到 localStorage
- 每次应用加载从 localStorage 恢复 Token
- 调用 GET /api/auth/me 验证 Token 有效性
- 未认证时自动重定向至 LoginPage
- 登出时清除 localStorage 中的 Token

## API 客户端 (`hooks/useApi.ts`)

统一的后端 API 调用封装，所有请求自动携带 JWT Bearer Token：

| 分组 | 方法 | 说明 |
|------|------|------|
| **Jobs** | fetchJobs, createJob, cancelJob, resumeJob, finalizeJob | 扫描作业管理 |
| **Workers** | fetchWorkers, createWorker, deployWorker, deleteWorker, updateWorker, getDeployKey, getDeployLogs, updateShowThinking | Worker 管理 |
| **Reports** | fetchReportList, fetchReportContent | 报告查看 |
| **Vulnerabilities** | fetchVulnerabilities, acceptVulnerability, rejectVulnerability, assignVulnerability | 漏洞管理 |
| **Memory** | fetchMemoryRules, createMemoryRule, approveMemoryRule, submitGlobal, deleteMemoryRule | Memory Rule |
| **Users** | fetchUsers, createUser, deleteUser | 用户管理 |
| **Scheduler** | getSchedule, updateSchedule, getSchedulerStatus | 调度配置 |

## SSE 连接管理

App.tsx 中管理 SSE (EventSource) 连接，为每个活跃的 Worker Slot 建立 EventSource：

```tsx
const es = new EventSource(
  `/api/sse/worker/${worker.id}/${slot.id}?token=${token}`
);
es.onmessage = (event) => { /* 更新 slot 日志状态 */ };
```

## 视图路由

App.tsx 使用简单状态路由（非 React Router），通过 currentView 切换组件：DashboardMain、PersonalDashboard、WorkerFleet、MyWorkers、ScanJobsQueue、VulnerabilityCenter、MemoryManager、UserManager、NodeDetail、ReportViewer。

## 侧边栏导航

根据用户角色动态显示：

- **admin**: 所有导航项 (含 User Management、My Workers)
- **committer**: 隐藏 User Management，可见 My Workers
- **user**: Dashboard + Vulnerability Center + Memory Manager + My Workers
