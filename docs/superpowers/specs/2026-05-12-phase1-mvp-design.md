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
- PostgreSQL persistence
- Redis queues
- CI/CD webhooks
- User authentication

## Architecture

```
┌──────────────┐      ┌──────────────────────────────────────────┐      ┌─────────┐
│  React SPA   │◄────►│           FastAPI Gateway                │◄────►│  nga    │
│  (Vite)      │  SSE  │  - Serve static files                   │      │  CLI    │
│              │       │  - /api/jobs (submit/list)              │      └─────────┘
│              │       │  - /api/sse/{slot_id} (live logs)       │         ▲
│              │       │  - /api/slot/{id}/acquire|push|status   │      subprocess
│              │       │  - /api/reports/{job_id} (view MD)      │         │
└──────────────┘      └──────────────────────────────────────────┘   orchestrator.py
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend | FastAPI replaces Express | Reuses orchestrator's web_server.py patterns; single Python process |
| SSE bridge | In-memory asyncio Queues | No Redis needed for MVP; simple and fast |
| Persistence | Filesystem only (reports/) | No PostgreSQL for MVP; orchestrator already writes files |
| Orchestrator execution | asyncio subprocess | Keeps orchestrator isolated; preserves CLI compatibility |
| Job queue | In-memory list | Resets on restart; acceptable for MVP |

## Data Flow: Scan Lifecycle

1. **User clicks "Trigger Scan"** → Frontend `POST /api/jobs`
2. **Gateway creates job** → Assigns `job_id`, stores in memory
3. **Gateway spawns orchestrator** → `asyncio.create_subprocess_exec(python orchestrator.py --files ...)`
4. **Orchestrator acquires slot** → `POST /api/slot/{id}/acquire` to Gateway
5. **Orchestrator pushes logs** → `POST /api/slot/{id}/push` to Gateway
6. **Gateway fans out to SSE** → All connected clients for that slot receive the log
7. **Orchestrator releases slot** → `POST /api/slot/{id}/release`
8. **Job completes** → Gateway updates job status, reports available at `/api/reports/{job_id}`

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
├── main.py              # FastAPI app, static files, lifespan
├── routers/
│   ├── jobs.py          # Job submission, listing, status
│   ├── sse.py           # SSE streaming endpoints
│   └── slots.py         # Slot acquire/push/status/release
├── services/
│   └── runner.py        # Orchestrator subprocess management
└── models/
    └── schemas.py       # Pydantic models (Job, SlotState, etc.)
```

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
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./reports:/app/reports
    environment:
      - PORT=3000
```

Single container: FastAPI serves frontend static files and manages orchestrator.

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
| `phase1: scaffold backend` | Create `backend/` with FastAPI, routers, models | `backend/*` |
| `phase1: orchestrator importable` | Wrap `main()`, add `create_orchestrator()` | `orchestrator.py` |
| `phase1: job api + runner` | Job submission, orchestrator subprocess | `backend/routers/jobs.py`, `backend/services/runner.py` |
| `phase1: sse bridge` | In-memory queues, slot endpoints, SSE streams | `backend/routers/sse.py`, `backend/routers/slots.py` |
| `phase1: frontend real data` | Jobs API integration, scan trigger | `src/App.tsx` |
| `phase1: report viewer` | Report listing and viewing | `src/components/ReportViewer.tsx` |
| `phase1: docker-compose` | One-command startup | `docker-compose.yml`, `Dockerfile` |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `nga` binary not available | Provide `--mock-mode` flag that simulates scan without `nga` |
| SSE performance with many logs | Trim in-memory logs to last 5000 lines per slot |
| Orchestrator subprocess leak | Gateway tracks PIDs, kills on timeout or job cancellation |
| Report files large | Stream file content, don't load entire report into memory |
