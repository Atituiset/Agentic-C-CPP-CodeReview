import os
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.database import engine, Base
from backend.redis_client import get_redis, close_redis
from backend.routers import jobs, sse, slots, reports
from backend.services.worker import worker_loop


# Project root relative to this file (backend/main.py -> project root)
PROJECT_ROOT = Path(__file__).parent.parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs(PROJECT_ROOT / "data", exist_ok=True)
    os.makedirs(PROJECT_ROOT / "reports", exist_ok=True)
    Base.metadata.create_all(bind=engine)
    await get_redis()

    # Start background worker
    worker_task = asyncio.create_task(worker_loop())

    yield

    # Shutdown
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass
    await close_redis()


app = FastAPI(title="Agentic CodeReview Platform", lifespan=lifespan)

app.include_router(jobs.router)
app.include_router(sse.router)
app.include_router(slots.router)
app.include_router(reports.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


# Static files: serve React build if dist/ exists
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{path:path}")
    async def serve_spa(path: str):
        if path.startswith("api/"):
            return {"error": "Not found"}
        index_path = FRONTEND_DIST / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        return {"error": "Frontend not built"}
