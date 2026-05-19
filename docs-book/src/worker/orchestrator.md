# Orchestrator 编排器

**`worker/orchestrator.py`** — 核心扫描编排器（~1300 行）

## CLI 接口

```bash
python3 worker/orchestrator.py \
  --repo /path/to/repo \
  --files file1.cpp file2.c \
  --diff "diff_content" \
  --full \
  --debug \
  --web-port 8080 \
  -c 3
```

| 参数 | 说明 |
|------|------|
| `--repo` | 目标仓库路径 |
| `--files` | 指定扫描文件列表 |
| `--diff` | 增量 diff 内容 |
| `--full` | 全量扫描模式 |
| `--debug` | 调试模式 |
| `--web-port` | Web 监控端口 |
| `-c` | 并发数（默认 3） |

## 核心类: OpenCodeOrchestrator

```python
class OpenCodeOrchestrator:
    def __init__(self, repo_path, concurrency=3, ...):
        self.semaphore = asyncio.Semaphore(concurrency)
        self.results = []

    async def scan_file(self, filepath: str) -> ScanResult:
        """扫描单个文件"""
        async with self.semaphore:
            # 1. 构造扫描 prompt
            # 2. 执行: nga run '<prompt>'
            # 3. 收集 stdout/stderr
            # 4. 生成 .md 报告
            # 5. 返回 ScanResult

    async def run(self, files: list[str]):
        """并发扫描所有文件"""
        tasks = [self.scan_file(f) for f in files]
        await asyncio.gather(*tasks)
        # 生成 summary.md
```

## 子进程管理

### 超时策略

动态超时根据 diff 行数计算：

```python
def calculate_timeout(diff_lines: int) -> int:
    base = 300  # 5 分钟基础超时
    extra = min(diff_lines * 2, 600)  # 每行增加 2s，最多 10 分钟
    return base + extra  # 范围: 300s - 900s
```

### 终止策略

```
1. 发送 SIGTERM (软终止)
2. 等待 10 秒
3. 如果进程仍在运行，发送 SIGKILL (硬终止)
```

### 并发控制

使用 `asyncio.Semaphore` 限制并发数（默认 3）：

```python
self.semaphore = asyncio.Semaphore(concurrency)

async def scan_file(self, filepath):
    async with self.semaphore:
        # 同一时刻最多 3 个 nga 子进程
        ...
```

## 报告生成

### 单文件报告

每个文件生成独立的 Markdown 报告：

```
reports/{timestamp}/
├── file1.cpp.md       # 单文件审计报告
├── file2.c.md         # 单文件审计报告
├── protocol/
│   └── packet.c.md    # 子目录文件
└── summary.md         # 汇总报告
```

### 报告格式

```markdown
## VULN-001: Buffer Overflow in process_packet

**Severity:** Critical
**File:** src/protocol/packet.c:142
**Category:** Memory Safety

### Description
The function `process_packet()` at line 142 performs an unchecked
memcpy into a fixed-size buffer...

### Recommendation
Replace memcpy with memcpy_s or add bounds checking...
```

## 工厂函数

```python
def create_orchestrator(repo_path: str, **kwargs) -> OpenCodeOrchestrator:
    """程序化创建 Orchestrator 实例，供 Worker Service 调用"""
    return OpenCodeOrchestrator(repo_path, **kwargs)
```
