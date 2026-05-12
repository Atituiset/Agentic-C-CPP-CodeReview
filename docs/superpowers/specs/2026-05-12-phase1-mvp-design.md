---
name: phase1-mvp-design
description: Agentic CodeReview Platform Phase 1 MVP — unify React dashboard and Python scanner into a single FastAPI-backed system with real end-to-end scanning
metadata:
  type: project
---

# Phase 1 MVP Design — Agentic CodeReview Platform Fusion

## Overview

Merge `Agentic-C-CPP-CodeReview` (React dashboard) and `event-loop-agent` (Python scanner) into a unified system where the frontend can trigger real scans and view live execution logs via SSE.

## Goals

1. One command starts the complete system (`docker-compose up`)
2. Dashboard "Trigger Scan" button runs the real orchestrator
3. Live SSE streams show real 3-slot execution
4. Scan reports (Markdown) are viewable from the dashboard
5. Git commits at each milestone for review traceability

## Non-Goals (Phase 2+)

- Multi-worker / distributed scanning
- PostgreSQL persistence (using SQLite for Phase 1)
- CI/CD webhooks
- User authentication

## Architecture

```
                         ┌─────────────┐
                         │    Redis    │
                         │  (SSE/Queue)│
                         └──────┬──────┘
                                │
┌──────────────┐      ┌─────────▼────────────────────────────────┐      ┌─────────┐
│  React SPA   │◄────►│           FastAPI Gateway                │◄────►│  nga    │
│  (Vite)      │  SSE  │  - Serve static files                   │      │  CLI    │
│              │       │  - /api/jobs (submit/list)              │      └─────────┘
│              │       │  - /api/sse/{slot_id} (live logs)       │         ▲
│              │       │  - /api/slot/{id}/acquire|push|status   │      subprocess
│              │       │  - /api/reports/{job_id} (view MD)      │         │
└──────────────┘      └────┬─────────────────────────────────────┘   orchestrator.py
                           │
                    ┌──────▼──────┐      ┌──────────────┐
                    │   SQLite    │      │  Filesystem  │
                    │ (Job/Task   │      │  (reports/   │
                    │   State)    │      │   logs)      │
                    └─────────────┘      └──────────────┘
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend | FastAPI replaces Express | Reuses orchestrator's web_server.py patterns; single Python process |
| SSE bridge | Redis Pub/Sub | Decouples orchestrator from Gateway; survives reconnections; Phase 2 ready |
| Database | SQLite (SQLAlchemy) | Lightweight, file-based, no extra container; stores job/task state + file indexes |
| Report/Log storage | Filesystem (reports/) | Orchestrator natively writes files; DB stores paths only |
| Orchestrator execution | asyncio subprocess | Keeps orchestrator isolated; preserves CLI compatibility |
| Job queue | Redis list (RPUSH/BLPOP) | Persistent across restarts; single-consumer queue for Phase 1 |

## Data Flow: Scan Lifecycle

1. **User clicks "Trigger Scan"** → Frontend `POST /api/jobs`
2. **Gateway creates job** → Writes to SQLite, pushes job to Redis queue
3. **Background worker picks up job** → BLPOP from Redis, spawns orchestrator subprocess
4. **Orchestrator acquires slot** → `POST /api/slot/{id}/acquire` to Gateway
5. **Orchestrator pushes logs** → `POST /api/slot/{id}/push` to Gateway
6. **Gateway publishes to Redis** → `PUBLISH slot:{id}:logs` with log chunk
7. **SSE subscribers receive** → Gateway's SSE handlers listen on Redis, fan out to clients
8. **Orchestrator updates status** → `POST /api/slot/{id}/status` → Gateway updates SQLite
9. **Orchestrator releases slot** → `POST /api/slot/{id}/release`
10. **Job completes** → Worker updates job status in SQLite, reports available at `/api/reports/{job_id}`

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Serve React SPA |
| GET | `/api/sse/{slot_id}` | SSE stream for slot logs |
| POST | `/api/jobs` | Submit new scan job |
| GET | `/api/jobs` | List jobs |
| GET | `/api/jobs/{job_id}` | Get job details |
| POST | `/api/slot/{slot_id}/acquire` | Orchestrator claims slot |
| POST | `/api/slot/{slot_id}/push` | Orchestrator pushes log chunk |
| POST | `/api/slot/{slot_id}/status` | Orchestrator updates task status |
| POST | `/api/slot/{slot_id}/release` | Orchestrator frees slot |
| GET | `/api/reports/{job_id}` | List reports for job |
| GET | `/api/reports/{job_id}/{filename}` | Download/view report |

## Frontend Changes

### App.tsx Modifications

1. **Jobs Queue real data**: Replace `MOCK_JOBS` with `useEffect` fetching `/api/jobs`
2. **Scan trigger**: `handleStartScan` calls `POST /api/jobs` instead of `/api/start_scan`
3. **Report viewer**: Add new component to fetch and render Markdown reports
4. **Metrics**: Count actual findings from log patterns instead of hardcoded numbers

### New Component: ReportViewer

- Fetches `/api/reports/{job_id}` for report list
- Renders Markdown content in a styled panel
- Accessible from Jobs Queue "View Report" action

## Backend Structure

```
backend/
├── main.py              # FastAPI app, static files, lifespan, DB init
├── config.py            # Settings (Redis URL, DB path, etc.)
├── database.py          # SQLAlchemy engine, session, Base
├── redis_client.py      # Redis connection + pub/sub helpers
├── routers/
│   ├── jobs.py          # Job submission, listing, status
│   ├── sse.py           # SSE streaming endpoints (Redis pub/sub)
│   ├── slots.py         # Slot acquire/push/status/release
│   └── reports.py       # Report listing and serving
├── services/
│   ├── runner.py        # Orchestrator subprocess management
│   └── worker.py        # Background job consumer (Redis BLPOP)
└── models/
    ├── schemas.py        # Pydantic models
    └── orm.py            # SQLAlchemy ORM models (Job, Task, ScanLog)
```

## Database Schema (SQLite)

### jobs
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Job identifier |
| repo_path | TEXT | Repository path |
| mode | TEXT | `diff` or `files` |
| target_commit | TEXT | Base commit (diff mode) |
| file_paths | TEXT | JSON array of files (files mode) |
| status | TEXT | `pending`, `queued`, `running`, `completed`, `failed`, `cancelled` |
| total_files | INT | Total tasks |
| completed_files | INT | Done tasks |
| failed_files | INT | Failed tasks |
| report_dir | TEXT | Path to reports/YYYYMMDD_HHMMSS |
| created_at | TIMESTAMP | |
| started_at | TIMESTAMP | |
| completed_at | TIMESTAMP | |

### tasks
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Task identifier |
| job_id | UUID FK | Parent job |
| file_path | TEXT | Scanned file |
| slot_id | INT | Assigned slot (0-2) |
| status | TEXT | `pending`, `running`, `done`, `failed` |
| report_file | TEXT | Path to .md report |
| log_file | TEXT | Path to .log file |
| started_at | TIMESTAMP | |
| completed_at | TIMESTAMP | |
| duration_seconds | FLOAT | |
| return_code | INT | nga exit code |
| error_message | TEXT | Error if failed |

## Orchestrator Changes

### orchestrator.py — Importable Module

Wrap the CLI `main()` so the module can be imported without executing argparse:

```python
def create_orchestrator(...):  # NEW
    """Create orchestrator instance without CLI parsing."""
    ...

def main():  # EXISTING (unchanged behavior)
    ...

if __name__ == "__main__":
    main()
```

No changes to scanning logic, process management, or report generation.

## Docker Compose

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./reports:/app/reports
      - ./data:/app/data
    environment:
      - PORT=3000
      - REDIS_URL=redis://redis:6379/0
      - DATABASE_URL=sqlite:///data/app.db
    depends_on:
      - redis

volumes:
  redis_data:
```

Two containers: Redis for queues and SSE pub/sub; FastAPI app serves frontend, manages DB, and runs orchestrator subprocesses.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Orchestrator crashes | Job marked `failed`, stderr captured, SSE sends error meta |
| Slot leak (no release) | Gateway timeout (120s) auto-releases slot |
| Frontend disconnect | SSE reconnects, receives current slot state on reconnect |
| Duplicate job submit | Reject with 409 if job already running for same repo |

## Testing Strategy

1. **Unit**: Pydantic model validation, slot state transitions
2. **Integration**: Submit job → verify SSE receives acquire/push/release → verify report exists
3. **E2E**: `docker-compose up` → open dashboard → trigger scan → verify live logs → verify report

## Milestones & Git Commits

| Commit | Scope | Files |
|--------|-------|-------|
| `phase1: scaffold backend` | Create `backend/` with FastAPI, config, DB, Redis | `backend/*` |
| `phase1: orchestrator importable` | Wrap `main()`, add `create_orchestrator()` | `orchestrator.py` |
| `phase1: database models` | SQLAlchemy ORM models, Alembic init | `backend/models/orm.py`, `alembic/*` |
| `phase1: job api + redis queue` | Job submission, Redis queue, SQLite storage | `backend/routers/jobs.py`, `backend/services/worker.py` |
| `phase1: sse bridge via redis` | Redis pub/sub for SSE, slot endpoints | `backend/routers/sse.py`, `backend/routers/slots.py`, `backend/redis_client.py` |
| `phase1: frontend real data` | Jobs API integration, scan trigger | `src/App.tsx` |
| `phase1: report viewer` | Report listing and viewing | `src/components/ReportViewer.tsx` |
| `phase1: docker-compose` | Redis + app containers | `docker-compose.yml`, `Dockerfile` |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `nga` binary not available | Provide `--mock-mode` flag that simulates scan without `nga` |
| SSE performance with many logs | Trim in-memory logs to last 5000 lines per slot |
| Orchestrator subprocess leak | Gateway tracks PIDs, kills on timeout or job cancellation |
| Report files large | Stream file content, don't load entire report into memory |
