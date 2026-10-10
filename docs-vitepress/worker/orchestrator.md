# Orchestrator 编排器

**`worker/orchestrator.py`** — 核心扫描编排器

## CLI 接口

```bash
python3 worker/orchestrator.py \
  --repo /path/to/repo \
  --files file1.cpp file2.c \
  --diff "target_commit" \
  --full \
  --debug \
  --web-port 8080 \
  -c 3
```

| 参数 | 说明 |
|------|------|
| `--repo` | 目标仓库路径 |
| `--files` | 指定扫描文件列表 |
| `--diff` | 增量扫描目标 commit |
| `--full` | 全量扫描模式 |
| `--debug` | 调试模式 |
| `--web-port` | Web 监控端口 |
| `-c` | 并发数 (默认 3) |

## 核心类: OpenCodeOrchestrator

```python
class OpenCodeOrchestrator:
    def __init__(self, repo_path, concurrency=3, ...):
        self.semaphore = asyncio.Semaphore(concurrency)
        self.results = []

    async def scan_file(self, filepath: str) -> ScanResult:
        async with self.semaphore:
            # 1. 构造扫描 prompt
            # 2. 执行: nga run '<prompt>'
            # 3. 收集 stdout/stderr
            # 4. 生成 .md 报告
            # 5. 返回 ScanResult

    async def run(self, files: list[str]):
        tasks = [self.scan_file(f) for f in files]
        await asyncio.gather(*tasks)
        # 生成 summary.md
```

## 子进程管理

### 动态超时

```python
def calculate_timeout(diff_lines: int) -> int:
    base = 300                          # 5 分钟基础
    extra = min(diff_lines // 10 * 60, 600)  # 每 10 行增加 60s，最多 10 分钟
    return base + extra                 # 范围: 300s - 900s
```

### 终止策略

1. 发送 SIGTERM (软终止)
2. 等待 10 秒
3. 如果进程仍在运行，发送 SIGKILL (硬终止)

### 并发控制

使用 asyncio.Semaphore 限制并发数 (默认 3)。

## 报告生成

每个文件生成独立的 Markdown 报告：

```
reports/{job_id}/
├── file1.cpp.md       # 单文件审计报告
├── file2.c.md
├── protocol/
│   └── packet.c.md
└── summary.md         # 汇总报告
```

## 断点续扫

将已扫描文件列表保存为 checkpoint JSON：

```json
{
  "completed": ["src/file1.c", "src/file2.cpp"],
  "failed": ["src/buggy.c"]
}
```

中断后可从 checkpoint 恢复，跳过已完成文件继续扫描。

## 工厂函数

```python
def create_orchestrator(repo_path: str, **kwargs) -> OpenCodeOrchestrator:
    """程序化创建 Orchestrator 实例，供 Worker Service 调用"""
    return OpenCodeOrchestrator(repo_path, **kwargs)
```
