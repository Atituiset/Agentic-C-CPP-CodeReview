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
