import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.database import engine, Base
from backend.redis_client import get_redis, close_redis
from backend.routers import jobs, sse, slots, reports
from backend.services.worker import worker_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs("./data", exist_ok=True)
    os.makedirs("./reports", exist_ok=True)
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
if os.path.isdir("./frontend/dist"):
    app.mount("/assets", StaticFiles(directory="./frontend/dist/assets"), name="assets")

    @app.get("/{path:path}")
    async def serve_spa(path: str):
        if path.startswith("api/"):
            return {"error": "Not found"}
        index_path = "./frontend/dist/index.html"
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"error": "Frontend not built"}
