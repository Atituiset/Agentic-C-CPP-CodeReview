# 数据库模型

系统使用 SQLAlchemy ORM + SQLite，所有模型定义在 `backend/models/orm.py`。

## ER 图

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│     User      │     │     Job      │     │      Task        │
├──────────────┤     ├──────────────┤     ├──────────────────┤
│ id (PK)      │     │ id (PK)      │     │ id (PK)          │
│ username     │     │ worker_id FK │     │ job_id (FK)      │
│ password_hash│     │ repo_path    │     │ filename         │
│ role         │     │ status       │     │ status           │
│ created_at   │     │ created_at   │     │ started_at       │
│              │     │ completed_at │     │ completed_at     │
└──────────────┘     │ commit_hash  │     │ report_path      │
                     └──────┬───────┘     └──────────────────┘
                            │
                            │ 1:N
                            │
                     ┌──────▼───────┐
                     │   Worker     │
                     ├──────────────┤
                     │ id (PK)      │
                     │ hostname     │
                     │ ip_address   │
                     │ slots_count  │
                     │ status       │
                     │ last_heartbeat│
                     └──────────────┘

┌──────────────────────┐     ┌──────────────────────┐
│    Vulnerability      │     │    MemoryRule        │
├──────────────────────┤     ├──────────────────────┤
│ id (PK)              │     │ id (PK)              │
│ job_id (FK)          │     │ title                │
│ task_id (FK)         │     │ description          │
│ title                │     │ rule_type            │
│ description          │     │ category             │  positive / negative
│ severity             │     │ scope                │  personal / global
│ status               │     │ created_by (FK→User) │
│ assigned_to (FK→User)│     │ approved_by (FK→User)│
│ created_by (FK→User) │     │ status               │  pending / approved / rejected
│ file_path            │     │ created_at           │
│ line_number          │     └──────────────────────┘
│ created_at           │
└──────────────────────┘

┌──────────────────────┐     ┌──────────────────────┐
│  SchedulerConfig     │     │ WorkerScheduleConfig │
├──────────────────────┤     ├──────────────────────┤
│ id (PK)              │     │ id (PK)              │
│ worker_id (FK)       │     │ worker_id (FK)       │
│ cron_expression      │     │ enabled              │
│ enabled              │     │ cron_expression      │
│ repo_path            │     │ repo_path            │
└──────────────────────┘     └──────────────────────┘
```

## 模型详情

### User

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer (PK) | 自增主键 |
| username | String (unique) | 用户名 |
| password_hash | String | bcrypt 哈希 |
| role | String | admin / committer / user |
| created_at | DateTime | 创建时间 |

### Job

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer (PK) | 自增主键 |
| worker_id | String (FK→Worker) | 执行 Worker |
| repo_path | String | 仓库路径 |
| status | String | pending / running / completed / failed / cancelled |
| created_at | DateTime | 创建时间 |
| completed_at | DateTime | 完成时间 |
| commit_hash | String | Git commit hash |

### Task

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer (PK) | 自增主键 |
| job_id | Integer (FK→Job) | 所属作业 |
| filename | String | 扫描文件名 |
| status | String | pending / running / completed / failed |
| started_at | DateTime | 开始时间 |
| completed_at | DateTime | 完成时间 |
| report_path | String | 报告文件路径 |

### Vulnerability

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer (PK) | 自增主键 |
| job_id | Integer (FK→Job) | 来源作业 |
| task_id | Integer (FK→Task) | 来源任务 |
| title | String | 漏洞标题 |
| description | Text | 漏洞描述 |
| severity | String | critical / high / medium / low / info |
| status | String | open / accepted / rejected / assigned |
| assigned_to | Integer (FK→User) | 分配给 |
| created_by | Integer (FK→User) | 创建者 |
| file_path | String | 文件路径 |
| line_number | Integer | 行号 |
| created_at | DateTime | 创建时间 |

### MemoryRule

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer (PK) | 自增主键 |
| title | String | 规则标题 |
| description | Text | 规则描述 |
| rule_type | String | positive / negative |
| category | String | 分类 |
| scope | String | personal / global |
| created_by | Integer (FK→User) | 创建者 |
| approved_by | Integer (FK→User) | 审批者 |
| status | String | pending / approved / rejected |
| created_at | DateTime | 创建时间 |
