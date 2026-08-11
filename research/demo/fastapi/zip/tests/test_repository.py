import pytest

from zip_api.config import Settings
from zip_api.repository import RedisZipRepository, StoredZipDataError, ZipEntry

pytestmark = pytest.mark.integration


@pytest.fixture
def settings() -> Settings:
    return Settings(
        redis_url="redis://localhost:6379/15",
        data_key="zip-codes:test",
        metadata_key="zip-codes:test:meta",
        expected_count=12,
        expected_sha256="expected-sha",
    )


async def test_lookup_uses_lexical_prefix_order_and_limit(redis_client, settings) -> None:
    members = {f"462{suffix:02d}\tCity {suffix}": 0 for suffix in range(12)}
    await redis_client.zadd(settings.data_key, members)
    repository = RedisZipRepository(redis_client, settings)

    assert await repository.lookup("462") == [
        ZipEntry(zip=f"462{suffix:02d}", city=f"City {suffix}")
        for suffix in range(10)
    ]
    assert await repository.lookup("00000") == []


async def test_lookup_supports_one_through_five_digit_prefixes(redis_client, settings) -> None:
    await redis_client.zadd(settings.data_key, {"46201\tIndianapolis": 0})
    repository = RedisZipRepository(redis_client, settings)

    for prefix in ("4", "46", "462", "4620", "46201"):
        assert await repository.lookup(prefix) == [ZipEntry("46201", "Indianapolis")]


async def test_lookup_rejects_malformed_members(redis_client, settings) -> None:
    await redis_client.zadd(settings.data_key, {"46201 Indianapolis": 0})
    repository = RedisZipRepository(redis_client, settings)

    with pytest.raises(StoredZipDataError):
        await repository.lookup("462")


async def test_readiness_requires_matching_metadata_and_cardinality(redis_client, settings) -> None:
    await redis_client.zadd(settings.data_key, {f"{index:05d}\tCity": 0 for index in range(12)})
    await redis_client.hset(settings.metadata_key, mapping={"count": "12", "sha256": "expected-sha"})
    repository = RedisZipRepository(redis_client, settings)

    assert await repository.is_ready() is True
    await redis_client.hset(settings.metadata_key, "sha256", "wrong")
    assert await repository.is_ready() is False
