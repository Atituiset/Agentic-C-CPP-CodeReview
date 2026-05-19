# 状态管理与 API 集成

## Auth Context (`context/AuthContext.tsx`)

应用级别的认证状态管理：

```tsx
interface AuthContextType {
  user: MeResponse | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}
```

### 关键行为

- 登录成功后将 JWT Token 存储到 `localStorage`
- 每次应用加载时从 `localStorage` 恢复 Token
- 调用 `GET /api/auth/me` 验证 Token 有效性
- 未认证时自动重定向至 LoginPage
- 登出时清除 `localStorage` 中的 Token

## API 客户端 (`hooks/useApi.ts`)

统一的后端 API 调用封装，所有请求自动携带 JWT Bearer Token：

### API 分组

| 分组 | 方法 | 说明 |
|------|------|------|
| **Jobs** | `fetchJobs()`, `createJob()`, `cancelJob()`, `resumeJob()`, `gitSyncJob()` | 扫描作业管理 |
| **Workers** | `fetchWorkers()`, `registerWorker()`, `heartbeat()`, `getGitStatus()` | Worker 管理 |
| **Reports** | `fetchReportList()`, `fetchReportContent()` | 报告查看 |
| **Vulnerabilities** | `fetchVulnerabilities()`, `acceptVulnerability()`, `rejectVulnerability()`, `assignVulnerability()` | 漏洞管理 |
| **Memory** | `fetchMemoryRules()`, `createMemoryRule()`, `approveMemoryRule()`, `deleteMemoryRule()` | Memory Rule |
| **Users** | `fetchUsers()`, `createUser()`, `deleteUser()` | 用户管理 |
| **Scheduler** | `getSchedule()`, `updateSchedule()` | 调度配置 |

### 请求示例

```typescript
const createJob = async (repoPath: string, workerId: string) => {
  const res = await fetch('/api/jobs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ repo_path: repoPath, worker_id: workerId }),
  });
  return res.json();
};
```

## SSE 连接管理

App.tsx 中管理 SSE (EventSource) 连接：

```tsx
// 为每个活跃的 Worker Slot 建立 EventSource
useEffect(() => {
  workers.forEach(worker => {
    worker.slots.forEach(slot => {
      if (slot.status === 'busy') {
        const es = new EventSource(
          `/api/sse/worker/${worker.id}/${slot.id}?token=${token}`
        );
        es.onmessage = (event) => {
          // 更新 slot 日志状态
        };
      }
    });
  });
}, [workers]);
```

## 视图路由

App.tsx 使用简单的状态路由（非 React Router），通过 `currentView` 状态切换组件：

```tsx
const renderView = () => {
  switch (currentView) {
    case 'dashboard': return <DashboardMain />;
    case 'worker-fleet': return <WorkerFleet />;
    case 'scan-jobs': return <ScanJobsQueue />;
    case 'vulnerability-center': return <VulnerabilityCenter />;
    case 'memory-manager': return <MemoryManager />;
    case 'user-management': return <UserManager />;
    case 'node-detail': return <NodeDetail />;
    case 'report-viewer': return <ReportViewer />;
    default: return <DashboardMain />;
  }
};
```

## 侧边栏导航

根据用户角色动态显示：

- **admin**: 所有导航项可见
- **committer**: 隐藏 User Management
- **user**: 仅 Dashboard + Vulnerability Center + Memory Manager
