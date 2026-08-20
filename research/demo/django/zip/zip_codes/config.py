from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Settings:
    redis_url: str
    data_key: str
    metadata_key: str
    expected_count: int
    expected_sha256: str

    @classmethod
    def from_env(cls) -> Settings:
        expected_sha256 = os.environ.get("ZIP_DATASET_SHA256")
        if expected_sha256 is None:
            raise ValueError("ZIP_DATASET_SHA256 is required")

        return cls(
            redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
            data_key=os.getenv("ZIP_DATA_KEY", "zip-codes:v1"),
            metadata_key=os.getenv("ZIP_METADATA_KEY", "zip-codes:v1:meta"),
            expected_count=int(os.getenv("ZIP_DATASET_COUNT", "50000")),
            expected_sha256=expected_sha256,
        )
