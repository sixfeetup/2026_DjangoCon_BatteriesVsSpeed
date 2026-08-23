from __future__ import annotations

import os
import subprocess
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import insert, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from zellit_api.models import (
    Actor,
    Comment,
    CommentVote,
    Listing,
    ListingVote,
    Photo,
    ZipCode,
)

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def test_database_url() -> str:
    return os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+asyncpg://postgres@localhost:55433/postgres",
    )


@pytest.fixture(scope="session")
def migrated_database(test_database_url: str) -> Iterator[str]:
    environment = {**os.environ, "DATABASE_URL": test_database_url}
    subprocess.run(
        ["uv", "run", "alembic", "downgrade", "base"],
        cwd=ROOT,
        env=environment,
        check=True,
    )
    subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        cwd=ROOT,
        env=environment,
        check=True,
    )
    yield test_database_url


@pytest_asyncio.fixture
async def integration_engine(migrated_database: str):
    engine = create_async_engine(migrated_database)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(integration_engine) -> AsyncIterator[AsyncSession]:
    factory = async_sessionmaker(integration_engine, expire_on_commit=False)
    async with factory() as session:
        await session.execute(
            text(
                "TRUNCATE zellit_comment_vote,zellit_listing_vote,zellit_photo,"
                "zellit_comment,zellit_listing,zellit_actor,zellit_zip_code,"
                "zellit_dataset_metadata RESTART IDENTITY CASCADE"
            )
        )
        await session.commit()
        yield session


@pytest_asyncio.fixture
async def api_data(db_session: AsyncSession) -> list[int]:
    base = datetime(2026, 1, 15, 12, 0, tzinfo=UTC)
    await db_session.execute(
        insert(ZipCode),
        [
            {
                "code": "46201",
                "city": "Indianapolis",
                "state": "IN",
                "population": 30000,
                "households": 12000,
                "median_age": 36,
                "median_household_income": 68000,
                "median_home_value": 248000,
            }
        ],
    )
    await db_session.execute(
        insert(Actor),
        [
            {"id": actor_id, "handle": f"actor{actor_id}", "display_name": f"Actor {actor_id}"}
            for actor_id in range(1, 9)
        ],
    )
    await db_session.execute(
        insert(Listing),
        [
            {
                "id": listing_id,
                "zip_code_id": "46201",
                "street_address": f"{listing_id} Example Street",
                "price": 100000 + listing_id,
                "bedrooms": 3,
                "bathrooms": 2,
                "square_feet": 1800,
                "year_built": 2000,
                "listed_at": base + timedelta(seconds=listing_id),
            }
            for listing_id in range(1, 61)
        ],
    )
    await db_session.execute(
        insert(Photo),
        [
            {
                "id": (listing_id - 1) * 4 + position + 1,
                "listing_id": listing_id,
                "position": position,
                "url": f"https://images.zellit.test/{listing_id}/{position}",
            }
            for listing_id in range(1, 61)
            for position in range(4)
        ],
    )
    await db_session.execute(
        insert(Comment),
        [
            {
                "id": (listing_id - 1) * 3 + position + 1,
                "listing_id": listing_id,
                "actor_id": position + 1,
                "body": f"Comment {position}",
                "created_at": base + timedelta(seconds=position),
            }
            for listing_id in range(1, 61)
            for position in range(3)
        ],
    )
    await db_session.execute(
        insert(ListingVote),
        [
            {
                "id": (listing_id - 1) * 8 + actor_id,
                "listing_id": listing_id,
                "actor_id": actor_id,
                "value": 1 if actor_id <= 6 else -1,
            }
            for listing_id in range(1, 61)
            for actor_id in range(1, 9)
        ],
    )
    await db_session.execute(
        insert(CommentVote),
        [
            {
                "id": (comment_id - 1) * 2 + actor_id,
                "comment_id": comment_id,
                "actor_id": actor_id,
                "value": 1 if actor_id == 1 else -1,
            }
            for comment_id in range(1, 181)
            for actor_id in (1, 2)
        ],
    )
    await db_session.commit()
    return list(range(1, 61))
