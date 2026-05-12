import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from backend.redis_client import get_redis

router = APIRouter()


async def event_generator(slot_id: int):
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


@router.get("/api/sse/{slot_id}")
async def sse_stream(slot_id: int):
    if slot_id < 0 or slot_id >= 3:
        return {"error": "Invalid slot"}
    return StreamingResponse(
        event_generator(slot_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
