from __future__ import annotations

from functools import lru_cache

from redis import Redis
from redis.backoff import NoBackoff
from redis.retry import Retry

from .config import Settings
from .repository import RedisZipRepository


@lru_cache(maxsize=1)
def get_repository() -> RedisZipRepository:
    settings = Settings.from_env()
    client = Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        retry_on_timeout=False,
        retry=Retry(NoBackoff(), 0),
    )
    return RedisZipRepository(client, settings)
