from __future__ import annotations

import os

import pytest
from redis import Redis

from zip_codes.config import Settings
from zip_codes.repository import RedisZipRepository
from zip_codes.repository import StoredZipDataError
from zip_codes.repository import ZipEntry

pytestmark = pytest.mark.integration


@pytest.fixture
def zip_settings() -> Settings:
    return Settings(
        redis_url="redis://localhost:6379/15",
        data_key="zip-codes:test",
        metadata_key="zip-codes:test:meta",
        expected_count=12,
        expected_sha256="expected-sha",
    )


@pytest.fixture
def redis_client():
    client = Redis.from_url(
        os.getenv("TEST_REDIS_URL", "redis://localhost:6379/15"),
        decode_responses=True,
    )
    client.flushdb()
    try:
        yield client
    finally:
        client.flushdb()
        client.close()


def test_lookup_uses_lexical_prefix_order_and_limit(redis_client, zip_settings) -> None:
    members = {f"462{suffix:02d}\tCity {suffix}": 0 for suffix in range(12)}
    redis_client.zadd(zip_settings.data_key, members)
    repository = RedisZipRepository(redis_client, zip_settings)

    assert repository.lookup("462") == [
        ZipEntry(zip=f"462{suffix:02d}", city=f"City {suffix}") for suffix in range(10)
    ]
    assert repository.lookup("00000") == []


def test_lookup_supports_one_through_five_digit_prefixes(
    redis_client, zip_settings
) -> None:
    redis_client.zadd(zip_settings.data_key, {"46201\tIndianapolis": 0})
    repository = RedisZipRepository(redis_client, zip_settings)

    for prefix in ("4", "46", "462", "4620", "46201"):
        assert repository.lookup(prefix) == [ZipEntry("46201", "Indianapolis")]


def test_lookup_rejects_malformed_members(redis_client, zip_settings) -> None:
    redis_client.zadd(zip_settings.data_key, {"46201 Indianapolis": 0})
    repository = RedisZipRepository(redis_client, zip_settings)

    with pytest.raises(StoredZipDataError):
        repository.lookup("462")


def test_readiness_requires_matching_metadata_and_cardinality(
    redis_client, zip_settings
) -> None:
    redis_client.zadd(
        zip_settings.data_key, {f"{index:05d}\tCity": 0 for index in range(12)}
    )
    redis_client.hset(
        zip_settings.metadata_key,
        mapping={"count": "12", "sha256": "expected-sha"},
    )
    repository = RedisZipRepository(redis_client, zip_settings)

    assert repository.is_ready() is True
    redis_client.hset(zip_settings.metadata_key, "sha256", "wrong")
    assert repository.is_ready() is False
