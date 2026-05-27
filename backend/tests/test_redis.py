import pytest
import asyncio
import json


@pytest.fixture
async def redis_client():
    from backend.redis_client import get_redis, close_redis, reset_redis_pool
    reset_redis_pool()
    redis = await get_redis()
    yield redis
    await close_redis()


@pytest.mark.asyncio
async def test_redis_publish_subscribe():
    from backend.redis_client import get_redis, close_redis, reset_redis_pool

    reset_redis_pool()
    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe("test:channel")
    await redis.publish("test:channel", "hello")
    message = None
    async for msg in pubsub.listen():
        if msg["type"] == "message":
            message = msg["data"]
            break
    assert message == "hello"
    await pubsub.unsubscribe("test:channel")
    await close_redis()


@pytest.mark.asyncio
async def test_publish_log():
    from backend.redis_client import publish_log, get_redis, close_redis, reset_redis_pool

    reset_redis_pool()
    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe("slot:test-worker:0:logs")
    await publish_log(0, {"type": "stdout", "content": "test"}, worker_id="test-worker")

    message = None
    async for msg in pubsub.listen():
        if msg["type"] == "message":
            message = msg["data"]
            break

    data = json.loads(message)
    assert data["type"] == "stdout"
    assert data["content"] == "test"
    await pubsub.unsubscribe("slot:test-worker:0:logs")
    await close_redis()


@pytest.mark.asyncio
async def test_job_queue():
    from backend.redis_client import push_job_queue, pop_job_queue, close_redis, reset_redis_pool, get_redis

    reset_redis_pool()
    redis = await get_redis()
    await redis.delete("scan:job:queue")
    await push_job_queue("job-test-1")
    result = await pop_job_queue(timeout=1)
    assert result == "job-test-1"
    await close_redis()
