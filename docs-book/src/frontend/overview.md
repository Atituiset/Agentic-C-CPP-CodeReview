# 前端概览与组件

## 技术栈

- **构建工具**: Vite
- **框架**: React 19 + TypeScript
- **样式**: Tailwind CSS (Dark GitHub 风格主题)
- **状态**: React Context + hooks
- **ANSI 渲染**: AnsiUp 库，在 NodeDetail 中实时渲染终端输出

## 项目结构

```
frontend/src/
├── main.tsx              # 入口，渲染 App + AuthProvider
├── App.tsx               # 应用壳，视图路由 + SSE 管理
├── constants.ts          # 共享常量
├── context/
│   └── AuthContext.tsx    # 认证上下文，Token 管理
├── hooks/
│   └── useApi.ts         # API 客户端，所有后端调用
└── components/
    ├── LoginPage.tsx          # 登录页
    ├── DashboardMain.tsx      # 管理员全局仪表盘
    ├── PersonalDashboard.tsx  # 用户个人视图
    ├── MyWorkers.tsx          # 我的 Worker 管理
    ├── AddWorkerModal.tsx     # 添加 Worker 弹窗 (SSH 配置)
    ├── ScanJobsQueue.tsx      # 扫描作业队列
    ├── VulnerabilityCenter.tsx # 漏洞中心
    ├── ReportViewer.tsx       # 报告查看器 (失败文件高亮)
    ├── WorkerFleet.tsx        # Worker 集群
    ├── NodeDetail.tsx         # 节点详情 + 终端日志
    ├── MemoryManager.tsx      # Memory Rule 管理
    └── UserManager.tsx        # 用户管理
```

## 组件说明

### LoginPage

用户名/密码表单，JWT 认证。默认凭据: admin / admin123。

![登录页面](../images/login-page.png)

### DashboardMain

管理员全局视图：Fleet Utilization、Trigger Global MR Scan、统计卡片、Registered Worker Fleet。

![全局仪表盘](../images/dashboard-main.png)

### MyWorkers

Worker 管理页面：Add Worker (弹出 AddWorkerModal)、Deploy (一键 SSH 部署)、Delete、Edit。

### AddWorkerModal

创建新 Worker 表单：Worker ID、SSH Host/Port/Username、SSH Key/Password、Repo Path、Scan Mode、Cared Paths。

### WorkerFleet

所有注册 Worker 节点卡片：ID/状态、IP/主机名、并发槽位、负载百分比。

![Worker 集群](../images/worker-fleet.png)

### ScanJobsQueue

作业管理界面：作业列表、状态标签 (pending/queued/running/completed/failed/cancelled/interrupted/dispatched)、Cancel/Resume 操作。

![扫描作业队列](../images/scan-jobs-queue.png)

### VulnerabilityCenter

漏洞生命周期管理：严重程度/状态/类型筛选、Accept/Reject/Assign 操作。

![漏洞中心](../images/vulnerability-center.png)

### ReportViewer

报告查看：文件列表、失败文件红色高亮、警告横幅、Markdown 内容展示。

### MemoryManager

知识库管理：Global/Personal 选项卡、正向/负向规则、审批工作流、提交个人规则为全局。

![Memory Manager](../images/memory-manager.png)

### UserManager

Admin 专属：用户列表、创建/删除用户、角色分配。

![用户管理](../images/user-management.png)

### NodeDetail

Worker 节点终端视图：每个槽位实时日志流 (ANSI 渲染)、Slot 状态指示。

![节点详情](../images/node-detail.png)
