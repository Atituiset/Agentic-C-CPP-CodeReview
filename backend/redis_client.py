import json
import redis.asyncio as aioredis
from backend.config import settings

redis_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global redis_pool
    if redis_pool is None:
        redis_pool = await aioredis.from_url(
            settings.redis_url, decode_responses=True
        )
    return redis_pool


async def close_redis():
    global redis_pool
    if redis_pool is not None:
        await redis_pool.aclose()
        redis_pool = None


def reset_redis_pool():
    global redis_pool
    redis_pool = None


async def publish_log(slot_id: int, payload: dict, worker_id: str):
    redis = await get_redis()
    await redis.publish(f"slot:{worker_id}:{slot_id}:logs", json.dumps(payload))


async def publish_meta(slot_id: int, event: str, payload: dict, worker_id: str):
    redis = await get_redis()
    data = json.dumps({"type": "meta", "event": event, **payload})
    await redis.publish(f"slot:{worker_id}:{slot_id}:logs", data)


async def push_job_queue(job_id: str):
    redis = await get_redis()
    await redis.lpush("scan:job:queue", job_id)


async def pop_job_queue(timeout: int = 5) -> str | None:
    redis = await get_redis()
    result = await redis.brpop("scan:job:queue", timeout=timeout)
    return result[1] if result else None
