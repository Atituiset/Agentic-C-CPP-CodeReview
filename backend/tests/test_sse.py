import pytest
import asyncio
from backend.redis_client import get_redis, reset_redis_pool, close_redis
from backend.routers.sse import event_generator


@pytest.mark.asyncio
async def test_event_generator():
    reset_redis_pool()
    redis = await get_redis()

    # Publish a message in background after short delay
    async def publish_after_delay():
        await asyncio.sleep(0.1)
        await redis.publish("slot:0:logs", '{"type":"stdout","content":"hello"}')

    publisher = asyncio.create_task(publish_after_delay())

    # Collect messages from generator with timeout
    messages = []
    try:
        async for msg in event_generator(0):
            messages.append(msg)
            if len(messages) >= 1:
                break
    except asyncio.TimeoutError:
        pass

    await publisher
    await close_redis()

    assert len(messages) >= 1
    assert '"type":"stdout"' in messages[0]
