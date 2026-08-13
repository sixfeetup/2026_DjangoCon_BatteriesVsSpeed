import os

import pytest
import redis.asyncio as redis


@pytest.fixture
async def redis_client():
    client = redis.from_url(os.getenv("TEST_REDIS_URL", "redis://localhost:6379/15"))
    await client.flushdb()
    try:
        yield client
    finally:
        await client.flushdb()
        await client.aclose()
