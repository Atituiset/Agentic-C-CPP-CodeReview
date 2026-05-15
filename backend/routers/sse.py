import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from backend.redis_client import get_redis

router = APIRouter()


async def event_generator_legacy(slot_id: int):
    """Legacy event generator - subscribes to the original channel."""
    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"slot:{slot_id}:logs")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = message["data"]
                yield f"data: {data}\n\n"
    finally:
        await pubsub.unsubscribe(f"slot:{slot_id}:logs")


async def event_generator(worker_id: str, slot_id: int):
    """Worker-specific event generator."""
    redis = await get_redis()
    pubsub = redis.pubsub()
    channel = f"slot:{worker_id}:{slot_id}:logs"
    await pubsub.subscribe(channel)

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = message["data"]
                yield f"data: {data}\n\n"
    finally:
        await pubsub.unsubscribe(channel)


@router.get("/api/sse/{slot_id}")
async def sse_stream_legacy(slot_id: int):
    """Legacy SSE endpoint - subscribes to the original channel for backward compatibility."""
    if slot_id < 0 or slot_id >= 3:
        return {"error": "Invalid slot"}
    return StreamingResponse(
        event_generator_legacy(slot_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/api/sse/{worker_id}/{slot_id}")
async def sse_stream(worker_id: str, slot_id: int):
    """Worker-specific SSE endpoint."""
    if slot_id < 0 or slot_id >= 3:
        return {"error": "Invalid slot"}
    return StreamingResponse(
        event_generator(worker_id, slot_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
