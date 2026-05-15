import os
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.database import engine, Base
from backend.redis_client import get_redis, close_redis
from backend.routers import jobs, sse, slots, reports, workers, auth, users
from backend.services.worker import worker_loop


# Project root relative to this file (backend/main.py -> project root)
PROJECT_ROOT = Path(__file__).parent.parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs(PROJECT_ROOT / "data", exist_ok=True)
    os.makedirs(PROJECT_ROOT / "reports", exist_ok=True)
    Base.metadata.create_all(bind=engine)

    # Seed default admin if no users exist
    from backend.database import SessionLocal
    from backend.models.orm import User as UserModel
    from backend.services.auth_service import hash_password

    db = SessionLocal()
    try:
        if db.query(UserModel).count() == 0:
            admin = UserModel(
                username="admin",
                display_name="Administrator",
                password_hash=hash_password("admin123"),
                role="admin",
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()

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
app.include_router(workers.router)
app.include_router(auth.router)
app.include_router(users.router)


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
