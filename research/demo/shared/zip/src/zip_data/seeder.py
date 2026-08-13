from __future__ import annotations

from contextlib import suppress
import json
from pathlib import Path
import re
import uuid

import redis

from .dataset import DatasetVerificationError, verify_dataset

BATCH_SIZE = 1_000
ZIP_PATTERN = re.compile(r"[0-9]{5}", re.ASCII)


class SeedError(RuntimeError):
    pass


def _load_records(data_dir: Path) -> list[tuple[str, str]]:
    records: list[tuple[str, str]] = []
    seen: set[str] = set()
    for line_number, raw_line in enumerate((data_dir / "zip_codes.jsonl").read_text(encoding="utf-8").splitlines(), start=1):
        if not raw_line:
            raise ValueError(f"line {line_number}: empty record")
        record = json.loads(raw_line)
        if not isinstance(record, dict):
            raise ValueError(f"line {line_number}: record must be an object")
        if set(record) != {"zip", "city"}:
            raise ValueError(f"line {line_number}: record keys mismatch")
        zip_code = record["zip"]
        city = record["city"]
        if not isinstance(zip_code, str) or not isinstance(city, str):
            raise ValueError(f"line {line_number}: record values must be strings")
        if not zip_code.isascii() or not ZIP_PATTERN.fullmatch(zip_code):
            raise ValueError(f"line {line_number}: zip must be a five-digit ASCII string")
        if any(sep in city for sep in ("\t", "\n", "\r")):
            raise ValueError(f"line {line_number}: city must not contain tabs or newlines")
        if zip_code in seen:
            raise ValueError(f"line {line_number}: duplicate zip code")
        seen.add(zip_code)
        records.append((zip_code, city))
    return records


def _load_batch(client: redis.Redis, key: str, batch: list[tuple[str, str]]) -> None:
    client.zadd(key, {f"{zip_code}\t{city}": 0 for zip_code, city in batch})


def seed_redis(
    redis_url: str,
    data_dir: Path,
    *,
    data_key: str = "zip-codes:v1",
    metadata_key: str = "zip-codes:v1:meta",
) -> None:
    client: redis.Redis | None = None
    temp_data_key: str | None = None
    temp_metadata_key: str | None = None
    try:
        manifest = verify_dataset(data_dir)
        records = _load_records(data_dir)
        if len(records) != manifest.count:
            raise ValueError("record count mismatch")

        client = redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            retry_on_timeout=False,
        )
        client.ping()

        token = uuid.uuid4().hex
        temp_data_key = f"{data_key}:loading:{token}:data"
        temp_metadata_key = f"{metadata_key}:loading:{token}:meta"

        for offset in range(0, len(records), BATCH_SIZE):
            _load_batch(client, temp_data_key, records[offset : offset + BATCH_SIZE])

        client.hset(temp_metadata_key, mapping={"count": str(manifest.count), "sha256": manifest.sha256})

        if client.zcard(temp_data_key) != manifest.count:
            raise ValueError("temporary sorted-set cardinality mismatch")

        if client.hgetall(temp_metadata_key) != {"count": str(manifest.count), "sha256": manifest.sha256}:
            raise ValueError("temporary metadata mismatch")

        with client.pipeline(transaction=True) as pipe:
            pipe.delete(data_key, metadata_key)
            pipe.rename(temp_data_key, data_key)
            pipe.rename(temp_metadata_key, metadata_key)
            pipe.execute()
    except (DatasetVerificationError, ValueError, redis.RedisError) as exc:
        raise SeedError("failed to seed Redis") from exc
    finally:
        if client is not None:
            if temp_data_key is not None and temp_metadata_key is not None:
                with suppress(redis.RedisError):
                    client.delete(temp_data_key, temp_metadata_key)
            client.close()
