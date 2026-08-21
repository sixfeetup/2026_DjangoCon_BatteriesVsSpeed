from __future__ import annotations

import os
from dataclasses import dataclass

COUNT_ENV = {
    "zip_codes": "ZELLIT_EXPECTED_ZIP_CODES",
    "actors": "ZELLIT_EXPECTED_ACTORS",
    "listings": "ZELLIT_EXPECTED_LISTINGS",
    "photos": "ZELLIT_EXPECTED_PHOTOS",
    "comments": "ZELLIT_EXPECTED_COMMENTS",
    "listing_votes": "ZELLIT_EXPECTED_LISTING_VOTES",
    "comment_votes": "ZELLIT_EXPECTED_COMMENT_VOTES",
}


def required(name: str) -> str:
    value = os.getenv(name)
    if value is None or not value.strip():
        raise ValueError(f"{name} is required")
    return value


@dataclass(frozen=True, slots=True)
class DatasetIdentity:
    schema_version: str
    digest: str
    row_counts: dict[str, int]


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str
    pool_size: int
    max_overflow: int
    dataset: DatasetIdentity

    @classmethod
    def from_env(cls) -> Settings:
        pool_size = int(os.getenv("DB_POOL_SIZE", "20"))
        max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "0"))
        if pool_size != 20:
            raise ValueError("DB_POOL_SIZE must be 20")
        if max_overflow != 0:
            raise ValueError("DB_MAX_OVERFLOW must be 0")
        return cls(
            database_url=required("DATABASE_URL"),
            pool_size=pool_size,
            max_overflow=max_overflow,
            dataset=DatasetIdentity(
                schema_version=required("ZELLIT_DATASET_SCHEMA_VERSION"),
                digest=required("ZELLIT_DATASET_DIGEST"),
                row_counts={
                    key: int(required(env_name))
                    for key, env_name in COUNT_ENV.items()
                },
            ),
        )
