# 数据流

## 作业生命周期

```
Create Job → pending
     │
     ▼
Redis LPUSH scan:job:queue → queued
     │
     ▼
Dispatcher BRPOP → dispatched
     │
     ▼
HTTP POST /scan (to Agent) → running
     │
     ▼
Orchestrator 扫描文件 → running
     │
     ├── 正常完成 → POST /finalize → completed
     ├── 用户取消 → cancelled
     ├── 进程中断 → interrupted
     └── 用户恢复 → resumed → running → completed
```

## Dispatcher 分发流程

```
Dispatcher Loop (lifespan 后台任务)
│
├── Redis BRPOP scan:job:queue (timeout=5s)
├── 解析 job_data (JSON)
├── 查找可用 Agent
│   ├── 过滤 status="idle" 的 Worker
│   ├── 排除 deploy_status != "deployed" 的 Worker
│   └── 选择第一个匹配的 Worker
├── 更新 Job.status = "dispatched", Job.worker_id = worker.id
└── HTTP POST worker.backend_url/api/scan
```

## Agent Finalize 流程

```
Agent 扫描完成
│
├── 遍历 report_dir/*.md
├── parse_vulnerability_report() 解析每个文件
├── 收集漏洞列表 + 报告内容
└── POST /api/jobs/{job_id}/finalize
    {
      "worker_id": "remote-01",
      "results": [
        {"file_path": "src/file1.c", "status": "completed",
         "report_content": "...", "vulnerabilities": [...]},
        {"file_path": "src/buggy.c", "status": "failed",
         "error": "timeout after 300s"}
      ]
    }
```

## Standalone Worker Node 路径

```
Worker Node 进程
│
├── 注册到 Gateway API
├── 心跳循环 (30s)
└── 作业消费循环
    ├── Redis BRPOP scan:job:queue
    ├── acquire_slot()
    ├── 启动 Orchestrator 子进程
    ├── 报告解析 → 漏洞写入
    ├── API 结果上报
    └── release_slot()
```

## SSH 部署流程

```
前端 MyWorkers → Deploy 按钮
│
▼
POST /api/workers/{id}/deploy (BackgroundTask)
│
▼
Deployer (asyncssh)
├── 1. deploy_status = "deploying"
├── 2. SSH connect (key/password/deploy-key)
├── 3. 检查 Python 3.10+
├── 4. pip install 依赖
├── 5. mkdir ~/.opencode-agent/
├── 6. SFTP 上传 agent.py, orchestrator.py, git_sync.py, config.json
├── 7. pkill 旧 Agent 进程
├── 8. nohup python3 agent.py &
├── 9. 等待注册 (最多 60s)
└── 10. deploy_status = "deployed" / "failed"
```

## SSE 实时日志流

```
前端 EventSource
│
├── /api/sse/worker/{worker_id}/{slot_id}?token=<jwt>
│
▼
FastAPI SSE endpoint
│
├── Redis SUBSCRIBE slot:{worker_id}:{slot_id}
└── 转发消息为 SSE event
    data: {"type": "log", "content": "...\n"}
    data: {"type": "status", "status": "completed"}
```

## 漏洞处理流程

```
/finalize 上报 → 写入 Vulnerability 表 (status=open)
│
├── Accept → status=accepted
│   └── 自动生成正向 Memory Rule (is_active=False, pending 审批)
├── Reject → status=rejected
│   └── 自动生成负向 Memory Rule (is_active=True, 立即生效)
└── Assign → status=assigned (分配给处理人)
```
