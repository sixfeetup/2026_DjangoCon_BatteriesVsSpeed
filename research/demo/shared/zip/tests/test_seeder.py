import os
from pathlib import Path

import pytest
import redis

from zip_data.dataset import generate_dataset
from zip_data.seeder import SeedError, seed_redis

REDIS_URL = os.getenv("TEST_REDIS_URL", "redis://localhost:6379/15")


@pytest.fixture
def client() -> redis.Redis:
    instance = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    instance.ping()
    instance.flushdb()
    yield instance
    instance.flushdb()
    instance.close()


def test_seed_promotes_complete_data_and_metadata(client: redis.Redis, tmp_path: Path) -> None:
    manifest = generate_dataset(tmp_path, count=500)
    seed_redis(REDIS_URL, tmp_path)

    assert client.zcard("zip-codes:v1") == 500
    assert client.zrangebylex("zip-codes:v1", "[462", "[462\xff", start=0, num=10)
    assert client.hgetall("zip-codes:v1:meta") == {
        "count": "500",
        "sha256": manifest.sha256,
    }
    assert not list(client.scan_iter("*:loading:*"))


def test_invalid_dataset_preserves_existing_production_keys(client: redis.Redis, tmp_path: Path) -> None:
    generate_dataset(tmp_path, count=500)
    client.zadd("zip-codes:v1", {"99999\tExisting": 0})
    client.hset("zip-codes:v1:meta", mapping={"count": "1", "sha256": "existing"})
    (tmp_path / "zip_codes.jsonl").write_text("not-json\n")

    with pytest.raises(SeedError):
        seed_redis(REDIS_URL, tmp_path)

    assert client.zrange("zip-codes:v1", 0, -1) == ["99999\tExisting"]
    assert client.hget("zip-codes:v1:meta", "sha256") == "existing"
