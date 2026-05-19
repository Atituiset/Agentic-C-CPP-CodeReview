# 核心服务

## Auth Service (`services/auth_service.py`)

提供密码哈希和 JWT Token 管理：

```python
def hash_password(password: str) -> str:
    """bcrypt 哈希"""

def verify_password(plain: str, hashed: str) -> bool:
    """bcrypt 验证"""

def create_access_token(username: str, role: str) -> str:
    """签发 JWT (HS256, 7天有效期)"""

def decode_token(token: str) -> dict:
    """解码并验证 JWT"""
```

## Worker Service (`services/worker.py`)

核心的作业消费与编排循环：

```python
async def worker_loop():
    """Redis BRPOP 消费者，编排器子进程管理"""
    while True:
        job_data = await pop_job_queue(timeout=5)
        if job_data:
            # 1. 更新 Job 状态为 running
            # 2. 调用 run_orchestrator() 启动子进程
            # 3. 轮询子进程进度
            # 4. 完成后调用 report_parser 解析漏洞
            # 5. 更新 Job 状态为 completed
            # 6. 释放 Slot
```

### 关键流程

1. 从 Redis `job_queue` 阻塞弹出作业
2. 更新 Job 状态 → running
3. 通过 `run_orchestrator()` 启动 `nga` 子进程
4. 定期轮询 Slot 状态获取进度
5. 子进程完成后调用 `parse_vulnerability_report()` 解析报告
6. 将解析出的漏洞写入 Vulnerability 表
7. 更新 Job 状态 → completed
8. 释放 Slot

## Scheduler Service (`services/scheduler.py`)

基于 APScheduler 的定时扫描调度：

```python
def get_scheduler() -> AsyncIOScheduler:
    """获取或创建调度器实例"""

def add_worker_schedule(worker_id, cron_expr, repo_path):
    """为 Worker 添加定时扫描任务"""

def remove_worker_schedule(worker_id, job_id):
    """移除定时扫描任务"""
```

支持 cron 表达式配置每日定时扫描，调度配置通过 `WorkerScheduleConfig` 持久化到数据库。

## Runner Service (`services/runner.py`)

Orchestrator 子进程管理：

```python
def find_orchestrator_script() -> str:
    """定位 orchestrator.py 脚本路径"""

def detect_default_model() -> str:
    """检测默认 LLM 模型"""

async def run_orchestrator(repo_path, job_id, worker_id, slot_id, ...):
    """启动 orchestrator 子进程并管理其生命周期"""
```

### 子进程管理策略

- 动态超时：300s - 900s（基于 diff 行数）
- 软终止：先发送 SIGTERM
- 硬终止：超时后发送 SIGKILL
- 日志捕获：stdout/stderr 实时读取

## Git Sync Service (`services/git_sync.py`)

```python
def get_head_commit(repo_path: str) -> str:
    """获取 HEAD commit hash"""

def get_changes_since(repo_path: str, since_commit: str) -> list:
    """获取自指定 commit 以来的变更文件列表"""

def get_all_cpp_files(repo_path: str) -> list:
    """获取所有 C/C++ 文件"""

def get_diff(repo_path: str, since_commit: str) -> str:
    """获取 diff 内容"""
```

## Report Parser Service (`services/report_parser.py`)

解析两种格式的漏洞报告：

### VULN-XXX 格式

```markdown
## VULN-001: Buffer Overflow in process_packet

**Severity:** Critical
**File:** src/protocol/packet.c:142
**Description:** ...
```

### NGA Review 格式

由 `nga` CLI 生成的标准审查报告格式，包含文件路径、行号、严重程度、描述等字段。

解析后输出结构化漏洞列表，包含：

- `title` — 漏洞标题
- `description` — 详细描述
- `severity` — 严重程度 (critical/high/medium/low/info)
- `file_path` — 文件路径
- `line_number` — 行号
- `category` — 漏洞分类
