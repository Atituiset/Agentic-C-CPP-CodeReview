# 数据库模型

## ER 关系

```
User 1──N Worker (owner_id)
User 1──N Job (created_by)
User 1──N MemoryRule (created_by)
User 1──N Vulnerability (accepted_by / rejected_by / assigned_to)

Worker 1──N Job (assigned_worker_id)
Worker 1──1 WorkerGitStatus (worker_id)
Worker 1──1 WorkerScheduleConfig (worker_id)

Job 1──N Task (job_id)
Job 1──N Vulnerability (job_id)
Job 1──1 Job (resumed_from_id, self-reference)
```

## 模型概览

共 9 个 ORM 模型，定义于 `backend/models/orm.py`。

| 模型 | 表名 | 说明 |
|------|------|------|
| User | users | 用户账户 |
| Worker | workers | 扫描 Worker 节点 |
| Job | jobs | 扫描作业 |
| Task | tasks | 单文件扫描任务 |
| Vulnerability | vulnerabilities | 扫描发现的漏洞 |
| MemoryRule | memory_rules | 知识库规则 |
| SchedulerConfig | scheduler_configs | 全局定时扫描配置 |
| WorkerGitStatus | worker_git_statuses | Worker Git 状态快照 |
| WorkerScheduleConfig | worker_schedule_configs | Worker 级定时扫描配置 |

---

## User

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String(36) | PK, UUID | 主键 |
| username | String(128) | UNIQUE, NOT NULL | 用户名 |
| display_name | String(256) | | 显示名 |
| password_hash | String(256) | NOT NULL | bcrypt 哈希密码 |
| role | String(16) | NOT NULL | 角色: admin / committer / user |
| show_thinking | Boolean | default=True | 是否显示 Agent 思考过程 |
| created_at | DateTime(tz) | server_default=now | 创建时间 |
| created_by | String(36) | FK->users.id | 创建者 |

## Worker

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String(36) | PK, UUID | 主键 |
| worker_id | String(64) | UNIQUE, NOT NULL | Worker 唯一标识 |
| hostname | String(256) | | 主机名 |
| ip_address | String(64) | | IP 地址 |
| status | String(16) | default="idle" | 状态: idle / busy |
| current_job_id | String(36) | | 当前执行的 Job ID |
| last_heartbeat | DateTime(tz) | | 最后心跳时间 |
| registered_at | DateTime(tz) | server_default=now | 注册时间 |
| capabilities | Text | | 能力描述 |
| show_thinking | Boolean | default=True | 是否显示思考过程 |
| owner_id | String(36) | FK->users.id | 所属用户 |
| ssh_host | String(256) | | SSH 主机 |
| ssh_port | Integer | default=22 | SSH 端口 |
| ssh_username | String(128) | | SSH 用户名 |
| ssh_key | Text | | SSH 私钥内容 |
| ssh_password | Text | | SSH 密码 |
| deploy_status | String(16) | default="pending" | 部署状态: pending / deploying / deployed / failed |
| deploy_error | Text | | 部署错误信息 |
| deploy_logs | Text | | 部署日志 (JSON 数组) |
| repo_path | Text | | 仓库路径 |
| scan_mode | String(16) | default="full" | 扫描模式: full / diff / files |
| target_commit | String(64) | | 增量扫描目标 commit |
| cared_paths | Text | | 关注路径 (JSON 数组) |

## Job

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String(36) | PK, UUID | 主键 |
| repo_path | Text | NOT NULL | 仓库路径 |
| mode | String(16) | NOT NULL | 扫描模式: diff / files / full |
| target_commit | String(64) | | 增量扫描目标 commit |
| file_paths | Text | | 文件列表 (JSON 数组) |
| status | String(16) | default="pending" | 状态 (见状态机) |
| total_files | Integer | default=0 | 总文件数 |
| completed_files | Integer | default=0 | 已完成文件数 |
| failed_files | Integer | default=0 | 失败文件数 |
| report_dir | Text | | 报告目录 |
| created_at | DateTime(tz) | server_default=now | 创建时间 |
| started_at | DateTime(tz) | | 开始时间 |
| completed_at | DateTime(tz) | | 完成时间 |
| cancelled_at | DateTime(tz) | | 取消时间 |
| checkpoint_data | Text | | 断点续扫数据 (JSON) |
| base_commit | String(64) | | 扫描起始 commit |
| scan_stats | Text | | 扫描统计 (JSON) |
| resumed_from_id | String(36) | FK->jobs.id | 恢复自哪个 Job |
| assigned_worker_id | String(64) | | 分配的 Worker ID |
| dispatch_error | Text | | 调度错误信息 |

**Job 状态机**:

```
pending -> queued -> dispatched -> running -> completed
                                      |
                                      +--> failed
                                      +--> cancelled
                                      +--> interrupted -> resumed -> running
```

## Task

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String(36) | PK, UUID | 主键 |
| job_id | String(36) | FK->jobs.id, NOT NULL | 所属 Job |
| file_path | Text | NOT NULL | 扫描文件路径 |
| slot_id | Integer | | 执行槽位 ID |
| worker_id | String(64) | | 执行 Worker ID |
| status | String(16) | default="pending" | 状态: pending / running / done / failed |
| report_file | Text | | 报告文件路径 |
| log_file | Text | | 日志文件路径 |
| started_at | DateTime(tz) | | 开始时间 |
| completed_at | DateTime(tz) | | 完成时间 |
| duration_seconds | Float | | 执行耗时 (秒) |
| return_code | Integer | | 子进程返回码 |
| error_message | Text | | 错误信息 |

## Vulnerability

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String(36) | PK, UUID | 主键 |
| job_id | String(36) | FK->jobs.id, NOT NULL | 所属 Job |
| task_id | String(36) | FK->tasks.id | 所属 Task |
| worker_id | String(64) | | 发现 Worker |
| vuln_id | String(32) | NOT NULL | 漏洞标识 |
| file_path | Text | NOT NULL | 文件路径 |
| line_start | Integer | | 起始行 |
| line_end | Integer | | 结束行 |
| severity | String(16) | NOT NULL | 严重度: critical / high / medium / low |
| vuln_type | String(32) | NOT NULL | 漏洞类型 |
| title | Text | NOT NULL | 漏洞标题 |
| description | Text | | 详细描述 |
| raw_json | Text | | 原始 JSON 数据 |
| status | String(16) | default="open" | 状态: open / accepted / rejected / assigned |
| generated_at | DateTime(tz) | server_default=now | 生成时间 |
| accepted_at | DateTime(tz) | | 接受时间 |
| accepted_by | String(36) | FK->users.id | 接受人 |
| rejected_at | DateTime(tz) | | 拒绝时间 |
| rejected_by | String(36) | FK->users.id | 拒绝人 |
| assigned_to | String(36) | FK->users.id | 分配给 |

## MemoryRule

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String(36) | PK, UUID | 主键 |
| source_vuln_id | String(36) | FK->vulnerabilities.id | 来源漏洞 |
| rule_type | String(16) | NOT NULL | 类型: positive / negative |
| scope | String(16) | NOT NULL | 范围: personal / global |
| owner_id | String(36) | FK->users.id | 所属用户 |
| file_pattern | String(512) | | 文件匹配模式 |
| code_pattern | String(512) | | 代码匹配模式 |
| vuln_type_filter | String(32) | | 漏洞类型过滤 |
| title | Text | NOT NULL | 规则标题 |
| description | Text | | 规则描述 |
| is_active | Boolean | default=True | 是否启用 |
| created_at | DateTime(tz) | server_default=now | 创建时间 |
| created_by | String(36) | FK->users.id | 创建者 |
| approved_at | DateTime(tz) | | 审批时间 |
| approved_by | String(36) | FK->users.id | 审批人 |

## SchedulerConfig

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String(36) | PK, UUID | 主键 |
| job_name | String(64) | UNIQUE, NOT NULL | 任务名称 |
| job_type | String(32) | NOT NULL | 类型: scan / stop |
| cron_expression | String(64) | NOT NULL | Cron 表达式 |
| is_enabled | Boolean | default=True | 是否启用 |
| last_run_at | DateTime(tz) | | 上次运行时间 |
| next_run_at | DateTime(tz) | | 下次运行时间 |
| created_at | DateTime(tz) | server_default=now | 创建时间 |
| updated_at | DateTime(tz) | onupdate=now | 更新时间 |

## WorkerGitStatus

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String(36) | PK, UUID | 主键 |
| worker_id | String(64) | UNIQUE, NOT NULL | Worker ID |
| head_commit | String(64) | | HEAD commit hash |
| added_files | Integer | default=0 | 新增文件数 |
| modified_files | Integer | default=0 | 修改文件数 |
| deleted_files | Integer | default=0 | 删除文件数 |
| changed_lines | Integer | default=0 | 变更行数 |
| total_cpp_files | Integer | default=0 | C/C++ 文件总数 |
| updated_at | DateTime(tz) | onupdate=now | 更新时间 |

## WorkerScheduleConfig

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String(36) | PK, UUID | 主键 |
| worker_id | String(64) | UNIQUE, NOT NULL | Worker ID |
| scan_hour | Integer | default=0 | 扫描开始时 |
| scan_minute | Integer | default=0 | 扫描开始分 |
| stop_hour | Integer | default=9 | 扫描停止时 |
| stop_minute | Integer | default=0 | 扫描停止分 |
| is_enabled | Boolean | default=True | 是否启用 |
| timezone | String(32) | default="Asia/Shanghai" | 时区 |
| created_at | DateTime(tz) | server_default=now | 创建时间 |
| updated_at | DateTime(tz) | onupdate=now | 更新时间 |
