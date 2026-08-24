# FastAPI Zellit Benchmark Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated FastAPI Zellit service that consumes the canonical shared dataset and satisfies the existing Django endpoint and Artillery processor with an exact five-query success path.

**Architecture:** A uv-managed FastAPI application uses one async SQLAlchemy engine, one request-scoped `AsyncSession`, explicit bulk queries, Pydantic response models, and Alembic-owned schema migrations. Its Docker Compose stack owns PostgreSQL and data volumes, while a dedicated shared benchmark runner reuses the existing corpus, profiles, processor, and artifact format.

**Tech Stack:** CPython 3.12.12, uv, FastAPI 0.141.x, Pydantic 2, SQLAlchemy 2.x async ORM, asyncpg, Alembic, PostgreSQL 18.1, Uvicorn, pytest/pytest-asyncio, Docker Compose, Node 22.23.2, pnpm 11.21.0, Artillery 2.0.33.

## Global Constraints

- Work only in the existing `fastapi-zellit` worktree and branch; do not modify the main checkout.
- Use uv for every Python dependency, lock, sync, and command; never use `pip`.
- Pin `.python-version` and the application image to CPython 3.12.12.
- Use one Uvicorn worker, no reload, and no benchmark access log.
- Configure SQLAlchemy with `pool_size=20` and `max_overflow=0`.
- Use an isolated FastAPI PostgreSQL service and isolated named volumes; never reference a Django service or volume.
- Do not change `research/demo/shared/zellit/data/` canonical files or checksums.
- Do not change `research/demo/shared/zellit/benchmark/scripts/run-compose.sh` or Django runtime normalization.
- Successful known-ZIP listing requests must execute exactly five SQL statements.
- Preserve the exact endpoint, JSON fields, validation bounds, ordering, `404`, and readiness behavior from Django Zellit.
- Smoke runs prove correctness only; do not make throughput or framework-ranking claims.

---

## File Structure

### New FastAPI project

- `research/demo/fastapi/zellit/.python-version` — exact Python pin.
- `research/demo/fastapi/zellit/pyproject.toml` and `uv.lock` — application and development dependency contract.
- `research/demo/fastapi/zellit/alembic.ini` — migration CLI configuration.
- `research/demo/fastapi/zellit/migrations/env.py` — async Alembic environment using application metadata and settings.
- `research/demo/fastapi/zellit/migrations/script.py.mako` — Alembic revision template.
- `research/demo/fastapi/zellit/migrations/versions/0001_create_zellit_schema.py` — exact loader-facing schema.
- `research/demo/fastapi/zellit/src/zellit_api/__init__.py` — package marker.
- `research/demo/fastapi/zellit/src/zellit_api/config.py` — settings and dataset identity.
- `research/demo/fastapi/zellit/src/zellit_api/database.py` — engine/session construction and FastAPI dependency.
- `research/demo/fastapi/zellit/src/zellit_api/models.py` — SQLAlchemy mappings.
- `research/demo/fastapi/zellit/src/zellit_api/schemas.py` — public Pydantic response models.
- `research/demo/fastapi/zellit/src/zellit_api/repository.py` — five-query read workflow and readiness check.
- `research/demo/fastapi/zellit/src/zellit_api/app.py` — lifespan, dependencies, endpoint, and health route.
- `research/demo/fastapi/zellit/tests/conftest.py` — PostgreSQL setup and deterministic compact fixture data.
- `research/demo/fastapi/zellit/tests/test_config.py` — environment and pool settings.
- `research/demo/fastapi/zellit/tests/test_database.py` — engine and session lifecycle.
- `research/demo/fastapi/zellit/tests/test_schema.py` — migration/schema/loader contract.
- `research/demo/fastapi/zellit/tests/test_repository.py` — values, ordering, and five-query invariant.
- `research/demo/fastapi/zellit/tests/test_api.py` — HTTP contract and failure mapping.
- `research/demo/fastapi/zellit/Dockerfile` — locked production image.
- `research/demo/fastapi/zellit/compose.yaml` — isolated database-to-benchmark stack.
- `research/demo/fastapi/zellit/scripts/smoke.sh` — fresh-volume system correctness check.
- `research/demo/fastapi/zellit/README.md` — operator, test, smoke, and benchmark workflow.

### Shared benchmark additions

- `research/demo/shared/zellit/benchmark/scripts/render-fastapi-runtime.mjs` — fixed normalized FastAPI runtime record.
- `research/demo/shared/zellit/benchmark/scripts/run-fastapi-compose.sh` — isolated FastAPI Compose benchmark runner.
- `research/demo/shared/zellit/benchmark/test/fastapi-runtime.test.mjs` — runtime and early-validation tests.
- `research/demo/shared/zellit/benchmark/test/benchmark.test.mjs` — runner wiring and metadata regression assertions.

---

### Task 1: Bootstrap the uv Project and Validated Settings

**Files:**
- Create: `research/demo/fastapi/zellit/.python-version`
- Create: `research/demo/fastapi/zellit/pyproject.toml`
- Create: `research/demo/fastapi/zellit/uv.lock`
- Create: `research/demo/fastapi/zellit/src/zellit_api/__init__.py`
- Create: `research/demo/fastapi/zellit/src/zellit_api/config.py`
- Create: `research/demo/fastapi/zellit/tests/test_config.py`

**Interfaces:**
- Produces: `DatasetIdentity`, `Settings.from_env()`, and exact pool/readiness values used by database, repository, Compose, and metadata tasks.
- `DatasetIdentity` fields: `schema_version: str`, `digest: str`, `row_counts: dict[str, int]`.
- `Settings` fields: `database_url: str`, `pool_size: int`, `max_overflow: int`, `dataset: DatasetIdentity`.

- [ ] **Step 1: Create the package skeleton with the exact Python pin**

```bash
cd research/demo/fastapi
uv init --package --python 3.12.12 zellit
cd zellit
printf '3.12.12\n' > .python-version
uv add 'fastapi>=0.141,<0.142' 'sqlalchemy[asyncio]>=2.0,<2.1' 'asyncpg>=0.31,<0.32' 'alembic>=1.16,<2' 'uvicorn>=0.35,<1'
uv add --dev 'httpx>=0.28,<1' 'pytest>=9,<10' 'pytest-asyncio>=1,<2' 'psycopg[binary]>=3.2,<4'
```

Keep the generated build system, set the description to `Async PostgreSQL Zellit benchmark API`, and add:

```toml
[tool.pytest.ini_options]
addopts = "-ra"
asyncio_mode = "auto"
markers = ["integration: requires the Compose PostgreSQL service"]
```

- [ ] **Step 2: Write failing settings tests**

```python
# tests/test_config.py
from __future__ import annotations

import pytest

from zellit_api.config import Settings

DATASET_ENV = {
    "ZELLIT_DATASET_SCHEMA_VERSION": "1",
    "ZELLIT_DATASET_DIGEST": "d631bfe327777c65a45098f536c9124c822a854480352e5f4564ce62946f3862",
    "ZELLIT_EXPECTED_ZIP_CODES": "500",
    "ZELLIT_EXPECTED_ACTORS": "20000",
    "ZELLIT_EXPECTED_LISTINGS": "100000",
    "ZELLIT_EXPECTED_PHOTOS": "400000",
    "ZELLIT_EXPECTED_COMMENTS": "300000",
    "ZELLIT_EXPECTED_LISTING_VOTES": "800000",
    "ZELLIT_EXPECTED_COMMENT_VOTES": "600000",
}


def test_settings_load_exact_runtime_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://postgres@db/postgres")
    for name, value in DATASET_ENV.items():
        monkeypatch.setenv(name, value)
    settings = Settings.from_env()
    assert settings.database_url == "postgresql+asyncpg://postgres@db/postgres"
    assert settings.pool_size == 20
    assert settings.max_overflow == 0
    assert settings.dataset.schema_version == "1"
    assert settings.dataset.row_counts == {
        "zip_codes": 500, "actors": 20000, "listings": 100000,
        "photos": 400000, "comments": 300000,
        "listing_votes": 800000, "comment_votes": 600000,
    }


@pytest.mark.parametrize("missing", ["ZELLIT_DATASET_SCHEMA_VERSION", "ZELLIT_DATASET_DIGEST", "ZELLIT_EXPECTED_LISTINGS"])
def test_settings_require_dataset_identity(monkeypatch: pytest.MonkeyPatch, missing: str) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://postgres@db/postgres")
    for name, value in DATASET_ENV.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv(missing)
    with pytest.raises(ValueError, match=missing):
        Settings.from_env()


@pytest.mark.parametrize(("name", "value"), [("DB_POOL_SIZE", "0"), ("DB_POOL_SIZE", "21"), ("DB_MAX_OVERFLOW", "1")])
def test_settings_reject_runtime_drift(monkeypatch: pytest.MonkeyPatch, name: str, value: str) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://postgres@db/postgres")
    for key, item in DATASET_ENV.items():
        monkeypatch.setenv(key, item)
    monkeypatch.setenv(name, value)
    with pytest.raises(ValueError, match=name):
        Settings.from_env()
```

- [ ] **Step 3: Run the tests and verify the missing module failure**

Run: `uv run pytest tests/test_config.py -q`

Expected: collection fails because `zellit_api.config` does not exist.

- [ ] **Step 4: Implement immutable settings with explicit validation**

```python
# src/zellit_api/config.py
from __future__ import annotations

from dataclasses import dataclass
import os

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
    def from_env(cls) -> "Settings":
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
                row_counts={key: int(required(env_name)) for key, env_name in COUNT_ENV.items()},
            ),
        )
```

- [ ] **Step 5: Run settings tests and the lock check**

Run: `uv run pytest tests/test_config.py -q && uv lock --check`

Expected: all settings tests pass and the lock is current.

- [ ] **Step 6: Commit the project foundation**

```bash
git add research/demo/fastapi/zellit
git commit -m "build: initialize FastAPI Zellit project"
```

---

### Task 2: Add Engine and Request-Scoped Session Lifecycle

**Files:**
- Create: `research/demo/fastapi/zellit/src/zellit_api/database.py`
- Create: `research/demo/fastapi/zellit/tests/test_database.py`

**Interfaces:**
- Consumes: `Settings` from Task 1.
- Produces: `build_engine(settings) -> AsyncEngine`, `build_session_factory(engine) -> async_sessionmaker[AsyncSession]`, and `get_session(request: Request) -> AsyncIterator[AsyncSession]`.

- [ ] **Step 1: Write failing lifecycle tests**

```python
# tests/test_database.py
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from zellit_api.config import DatasetIdentity, Settings
from zellit_api.database import build_engine, build_session_factory


@pytest.fixture
def settings() -> Settings:
    return Settings(
        "postgresql+asyncpg://postgres@localhost:55433/postgres", 20, 0,
        DatasetIdentity("1", "digest", {}),
    )


async def test_engine_uses_fixed_pool_contract(settings: Settings) -> None:
    engine = build_engine(settings)
    assert engine.pool.size() == 20
    assert engine.pool._max_overflow == 0
    await engine.dispose()


async def test_session_factory_closes_request_session(settings: Settings) -> None:
    engine = build_engine(settings)
    factory = build_session_factory(engine)
    session = factory()
    close = AsyncMock(wraps=session.close)
    session.close = close
    async with session:
        pass
    close.assert_awaited_once()
    await engine.dispose()
```

- [ ] **Step 2: Run tests to verify imports fail**

Run: `uv run pytest tests/test_database.py -q`

Expected: FAIL because `zellit_api.database` does not exist.

- [ ] **Step 3: Implement engine, session factory, and dependency**

```python
# src/zellit_api/database.py
from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from .config import Settings


def build_engine(settings: Settings) -> AsyncEngine:
    return create_async_engine(
        settings.database_url,
        pool_size=settings.pool_size,
        max_overflow=settings.max_overflow,
        pool_pre_ping=True,
    )


def build_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.session_factory() as session:
        yield session
```

Do not create an engine at import time.

- [ ] **Step 4: Run lifecycle tests**

Run: `uv run pytest tests/test_database.py -q`

Expected: all tests pass without requiring a live PostgreSQL connection.

- [ ] **Step 5: Commit lifecycle support**

```bash
git add research/demo/fastapi/zellit/src/zellit_api/database.py research/demo/fastapi/zellit/tests/test_database.py
git commit -m "feat: add async database lifecycle"
```

---

### Task 3: Create the Exact Loader-Compatible Schema with Alembic

**Files:**
- Create: `research/demo/fastapi/zellit/src/zellit_api/models.py`
- Create: `research/demo/fastapi/zellit/alembic.ini`
- Create: `research/demo/fastapi/zellit/migrations/env.py`
- Create: `research/demo/fastapi/zellit/migrations/script.py.mako`
- Create: `research/demo/fastapi/zellit/migrations/versions/0001_create_zellit_schema.py`
- Create: `research/demo/fastapi/zellit/compose.yaml`
- Create: `research/demo/fastapi/zellit/tests/conftest.py`
- Create: `research/demo/fastapi/zellit/tests/test_schema.py`

**Interfaces:**
- Consumes: the `DATABASE_URL` environment variable and SQLAlchemy metadata; migrations deliberately do not require dataset-readiness settings.
- Produces: mapped classes `ZipCode`, `Actor`, `Listing`, `Photo`, `Comment`, `ListingVote`, `CommentVote`, and `DatasetMetadata`; an Alembic-upgradable schema accepted by the unchanged shared loader.

- [ ] **Step 1: Add an isolated PostgreSQL-only Compose service for integration development**

```yaml
# compose.yaml (initial form; Task 6 extends it)
services:
  db:
    image: postgres:18.1
    environment:
      POSTGRES_HOST_AUTH_METHOD: trust
    ports:
      - "127.0.0.1:${POSTGRES_PORT:-55433}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready --host=db --username=postgres"]
      interval: 2s
      timeout: 5s
      retries: 30
    init: true
    user: postgres
    volumes:
      - fastapi-postgres-data:/var/lib/postgresql

volumes:
  fastapi-postgres-data:
```

- [ ] **Step 2: Write the failing migrated-schema test**

```python
# tests/test_schema.py
from __future__ import annotations

import pytest
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

EXPECTED_TABLES = {
    "zellit_zip_code", "zellit_actor", "zellit_listing", "zellit_photo",
    "zellit_comment", "zellit_listing_vote", "zellit_comment_vote",
    "zellit_dataset_metadata",
}
EXPECTED_INDEXES = {"listing_zip_id_idx", "comment_listing_id_idx"}
EXPECTED_UNIQUES = {
    "photo_listing_position_unique", "listing_vote_actor_unique",
    "comment_vote_actor_unique",
}
EXPECTED_CHECKS = {
    "zip_code_ascii_digits", "zip_state_upper_ascii", "zip_demographics_nonnegative",
    "listing_price_gt_0", "listing_bedrooms_gte_0", "listing_bathrooms_gte_0",
    "listing_sqft_gt_0", "listing_year_range", "listing_vote_value",
    "comment_vote_value", "dataset_metadata_singleton",
}

@pytest.mark.integration
async def test_migration_creates_loader_contract(test_database_url: str) -> None:
    engine = create_async_engine(test_database_url)
    def examine(connection):
        inspector = inspect(connection)
        tables = set(inspector.get_table_names())
        indexes = {item["name"] for table in EXPECTED_TABLES for item in inspector.get_indexes(table)}
        uniques = {item["name"] for table in EXPECTED_TABLES for item in inspector.get_unique_constraints(table)}
        checks = {item["name"] for table in EXPECTED_TABLES for item in inspector.get_check_constraints(table)}
        foreign_keys = {fk["options"].get("ondelete") for table in EXPECTED_TABLES for fk in inspector.get_foreign_keys(table)}
        return tables, indexes, uniques, checks, foreign_keys
    async with engine.connect() as connection:
        tables, indexes, uniques, checks, foreign_keys = await connection.run_sync(examine)
    await engine.dispose()
    assert EXPECTED_TABLES <= tables
    assert EXPECTED_INDEXES <= indexes
    assert EXPECTED_UNIQUES <= uniques
    assert EXPECTED_CHECKS <= checks
    assert foreign_keys == {"CASCADE"}
```

In `tests/conftest.py`, define `test_database_url` as `TEST_DATABASE_URL` or `postgresql+asyncpg://postgres@localhost:55433/postgres`, and a session-scoped autouse integration fixture that runs `uv run alembic downgrade base` followed by `uv run alembic upgrade head` with `DATABASE_URL` set.

- [ ] **Step 3: Start PostgreSQL and verify the migration test fails**

Run:

```bash
docker compose up -d --wait db
uv run pytest tests/test_schema.py -q -m integration
```

Expected: FAIL because Alembic configuration and the schema do not exist.

- [ ] **Step 4: Implement SQLAlchemy mappings with exact names and types**

Use `DeclarativeBase`, `Mapped`, and `mapped_column`. Map IDs to `Integer`, ZIP to `String(5)`, positive-small fields to `SmallInteger`, timestamps to `DateTime(timezone=True)`, and metadata rows to PostgreSQL `JSONB`. Every child foreign key must include `ondelete="CASCADE"`. Declare these exact database objects in model metadata:

```python
Index("listing_zip_id_idx", "zip_code_id", "id")
Index("comment_listing_id_idx", "listing_id", "id")
UniqueConstraint("listing_id", "position", name="photo_listing_position_unique")
UniqueConstraint("listing_id", "actor_id", name="listing_vote_actor_unique")
UniqueConstraint("comment_id", "actor_id", name="comment_vote_actor_unique")
CheckConstraint("code ~ '^[0-9]{5}$'", name="zip_code_ascii_digits")
CheckConstraint("state ~ '^[A-Z]{2}$'", name="zip_state_upper_ascii")
CheckConstraint("population >= 0 AND households >= 0 AND median_age >= 0 AND median_household_income >= 0 AND median_home_value >= 0", name="zip_demographics_nonnegative")
CheckConstraint("price > 0", name="listing_price_gt_0")
CheckConstraint("bedrooms >= 0", name="listing_bedrooms_gte_0")
CheckConstraint("bathrooms >= 0", name="listing_bathrooms_gte_0")
CheckConstraint("square_feet > 0", name="listing_sqft_gt_0")
CheckConstraint("year_built >= 1600 AND year_built <= 2100", name="listing_year_range")
CheckConstraint("value IN (-1, 1)", name="listing_vote_value")
CheckConstraint("value IN (-1, 1)", name="comment_vote_value")
CheckConstraint("id = 1", name="dataset_metadata_singleton")
```

Do not add relationship loading to the request path; repository statements use columns explicitly.

- [ ] **Step 5: Create the explicit initial Alembic revision**

Configure `migrations/env.py` to require `DATABASE_URL` directly from `os.environ`, set `target_metadata = Base.metadata`, create an async engine with `poolclass=pool.NullPool`, and run migrations through `connection.run_sync(do_run_migrations)`. This keeps schema upgrades independent from dataset-readiness configuration.

The revision's `upgrade()` must use `op.create_table`, `op.create_index`, and named constraints matching `models.py`. Its `downgrade()` must drop child tables first in this order:

```python
for table in (
    "zellit_comment_vote", "zellit_listing_vote", "zellit_photo", "zellit_comment",
    "zellit_listing", "zellit_actor", "zellit_zip_code", "zellit_dataset_metadata",
):
    op.drop_table(table)
```

- [ ] **Step 6: Run migration and schema tests**

Run:

```bash
DATABASE_URL=postgresql+asyncpg://postgres@localhost:55433/postgres uv run alembic upgrade head
TEST_DATABASE_URL=postgresql+asyncpg://postgres@localhost:55433/postgres uv run pytest tests/test_schema.py -q -m integration
```

Expected: the migration applies and the schema test passes.

- [ ] **Step 7: Prove the unchanged shared loader can seed the migrated schema**

Run from `research/demo/shared/zellit` after generating canonical ignored CSVs:

```bash
uv run zellit-data generate --spec data/spec.json --output data/generated --zip-input data/zip_codes.csv
uv run zellit-data verify --spec data/spec.json --manifest data/manifest.json --output data/generated
uv run zellit-data seed --database-url postgresql://postgres@localhost:55433/postgres --data-dir data/generated --manifest data/manifest.json --if-needed
```

Expected: generation verifies and seeding completes without a missing table, column, constraint, or type error.

- [ ] **Step 8: Commit the schema**

```bash
git add research/demo/fastapi/zellit
git commit -m "feat: add FastAPI Zellit database schema"
```

---

### Task 4: Implement the Five-Query Repository

**Files:**
- Create: `research/demo/fastapi/zellit/src/zellit_api/repository.py`
- Modify: `research/demo/fastapi/zellit/tests/conftest.py`
- Create: `research/demo/fastapi/zellit/tests/test_repository.py`

**Interfaces:**
- Consumes: Task 3 models and `DatasetIdentity`.
- Produces: `ZipCodeNotFound`, `ZellitRepository.get_listings(session, zip_code, limit, offset) -> dict[str, object]`, and `ZellitRepository.is_ready(session, dataset) -> bool`.

- [ ] **Step 1: Add deterministic compact fixture data**

In `tests/conftest.py`, add a function-scoped `db_session` that truncates all eight tables with `RESTART IDENTITY CASCADE`, then add `api_data` that inserts:

- ZIP `46201`, Indianapolis, IN, demographics `30000/12000/36/68000/248000`.
- Eight actors with IDs 1 through 8.
- Sixty listings with IDs 1 through 60, address `"{id} Example Street"`, price `100000 + id`, dimensions `3/2/1800`, year 2000, and UTC timestamps increasing by ID.
- Four photos per listing at positions 0 through 3.
- Three comments per listing authored by actors 1 through 3 with increasing comment IDs.
- Eight listing votes per listing: six `+1` and two `-1`, yielding score 4.
- Two votes per comment, `+1` and `-1`, yielding score 0.

Use SQLAlchemy bulk `insert()` statements and commit fixture setup before yielding the session.

- [ ] **Step 2: Write failing repository contract and query-count tests**

```python
# tests/test_repository.py
from __future__ import annotations

import pytest
from sqlalchemy import event

from zellit_api.repository import ZellitRepository, ZipCodeNotFound

pytestmark = pytest.mark.integration


@pytest.mark.parametrize("limit", [1, 20, 50])
async def test_success_uses_exactly_five_queries(db_session, api_data, limit: int) -> None:
    statements: list[str] = []
    engine = db_session.bind
    def record(*args) -> None:
        statements.append(args[2])
    event.listen(engine.sync_engine, "after_cursor_execute", record)
    try:
        payload = await ZellitRepository().get_listings(db_session, "46201", limit, 0)
    finally:
        event.remove(engine.sync_engine, "after_cursor_execute", record)
    assert len(statements) == 5
    assert len(payload["listings"]) == limit
    assert "zellit_zip_code" in statements[0]
    assert "avg" in statements[1].lower()
    assert "zellit_listing_vote" in statements[2] and "zellit_comment" in statements[2]
    assert "zellit_photo" in statements[3]
    assert "zellit_comment_vote" in statements[4] and "zellit_actor" in statements[4]


async def test_repository_returns_exact_ordered_values(db_session, api_data) -> None:
    body = await ZellitRepository().get_listings(db_session, "46201", 20, 20)
    assert body["zip_code"] == {"code": "46201", "city": "Indianapolis", "state": "IN", "demographics": {"population": 30000, "households": 12000, "median_age": 36, "median_household_income": 68000, "median_home_value": 248000}}
    assert body["market"] == {"listing_count": 60, "average_price": 100031}
    assert body["pagination"] == {"limit": 20, "offset": 20, "returned": 20}
    assert [item["id"] for item in body["listings"]] == list(range(21, 41))
    assert body["listings"][0]["vote_score"] == 4
    assert body["listings"][0]["comment_count"] == 3
    assert [photo["position"] for photo in body["listings"][0]["photos"]] == [0, 1, 2, 3]
    assert [comment["vote_score"] for comment in body["listings"][0]["comments"]] == [0, 0, 0]


async def test_unknown_zip_raises_stable_domain_error(db_session, api_data) -> None:
    with pytest.raises(ZipCodeNotFound):
        await ZellitRepository().get_listings(db_session, "99999", 20, 0)
```

- [ ] **Step 3: Run repository tests to verify failure**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://postgres@localhost:55433/postgres uv run pytest tests/test_repository.py -q -m integration`

Expected: FAIL because `zellit_api.repository` does not exist.

- [ ] **Step 4: Implement the five explicit statements**

In `repository.py`, use one `await session.execute(...)` for each numbered operation. The listing statement must use correlated scalar subqueries:

```python
listing_score = (
    select(func.coalesce(func.sum(ListingVote.value), 0))
    .where(ListingVote.listing_id == Listing.id)
    .correlate(Listing)
    .scalar_subquery()
)
comment_count = (
    select(func.count(Comment.id))
    .where(Comment.listing_id == Listing.id)
    .correlate(Listing)
    .scalar_subquery()
)
```

The market average must use PostgreSQL rounding and integer conversion:

```python
select(
    func.count(Listing.id).label("listing_count"),
    cast(func.round(func.avg(Listing.price)), Integer).label("average_price"),
).where(Listing.zip_code_id == zip_code)
```

The final two statements must always execute, including an empty known-ZIP page, by using `Photo.listing_id.in_(listing_ids)` and `Comment.listing_id.in_(listing_ids)`. Sort in SQL as follows:

```python
.order_by(Photo.listing_id, Photo.position)
.order_by(Comment.listing_id, Comment.id)
```

Join comments to `Actor`, add a correlated `CommentVote` sum, group returned rows into `defaultdict(list)`, and assemble plain dictionaries with every field from the Django schemas. Convert aggregate `None` to zero and aggregate values to built-in `int`.

Implement readiness with one metadata query and exact equality:

```python
async def is_ready(self, session: AsyncSession, dataset: DatasetIdentity) -> bool:
    row = (await session.execute(
        select(DatasetMetadata.schema_version, DatasetMetadata.dataset_digest, DatasetMetadata.row_counts)
        .where(DatasetMetadata.id == 1)
    )).one_or_none()
    return bool(row and row.schema_version == dataset.schema_version and row.dataset_digest == dataset.digest and row.row_counts == dataset.row_counts)
```

- [ ] **Step 5: Run repository tests and all current Python tests**

Run:

```bash
TEST_DATABASE_URL=postgresql+asyncpg://postgres@localhost:55433/postgres uv run pytest -q
```

Expected: config, database, schema, and repository tests pass; successful repository calls issue exactly five statements.

- [ ] **Step 6: Commit the query layer**

```bash
git add research/demo/fastapi/zellit/src/zellit_api/repository.py research/demo/fastapi/zellit/tests
git commit -m "feat: add five-query Zellit repository"
```

---

### Task 5: Add Pydantic Schemas and FastAPI HTTP Contract

**Files:**
- Create: `research/demo/fastapi/zellit/src/zellit_api/schemas.py`
- Create: `research/demo/fastapi/zellit/src/zellit_api/app.py`
- Create: `research/demo/fastapi/zellit/tests/test_api.py`
- Modify: `research/demo/fastapi/zellit/tests/test_database.py`

**Interfaces:**
- Consumes: settings, session dependency, and `ZellitRepository` from Tasks 1–4.
- Produces: `create_app(settings: Settings | None = None) -> FastAPI`, module-level `app`, `GET /api/v1/zip-codes/{zip_code}/listings`, and `GET /health`.

- [ ] **Step 1: Write stub-driven failing API tests**

Create a `StubRepository` with async `get_listings()` and `is_ready()` methods, plus a `create_test_app()` helper that overrides `get_session` with an async-yield dummy session and replaces `app.state.repository` inside `TestClient` lifespan.

```python
# required assertions in tests/test_api.py
response = client.get("/api/v1/zip-codes/46201/listings?limit=20&offset=0")
assert response.status_code == 200
assert set(response.json()) == {"zip_code", "market", "pagination", "listings"}

@pytest.mark.parametrize("query", ["limit=0", "limit=51", "offset=-1", "offset=200", "limit=nope"])
def test_invalid_pagination_is_422(client, query: str) -> None:
    assert client.get(f"/api/v1/zip-codes/46201/listings?{query}").status_code == 422

@pytest.mark.parametrize("zipcode", ["1234", "123456", "12x45", "１２３４５"])
def test_invalid_zip_is_422(client, zipcode: str) -> None:
    assert client.get(f"/api/v1/zip-codes/{zipcode}/listings").status_code == 422

def test_unknown_zip_is_stable_404(client, repository) -> None:
    repository.error = ZipCodeNotFound()
    response = client.get("/api/v1/zip-codes/99999/listings")
    assert response.status_code == 404
    assert response.json() == {"detail": "ZIP code not found"}

def test_health_contract(client, repository) -> None:
    repository.ready = True
    assert client.get("/health").json() == {"status": "ready"}
    repository.ready = False
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"detail": "Zellit dataset is not ready"}
```

Also test that `SQLAlchemyError` from health maps to the stable `503`, while `ValueError` from listings remains an unhandled `500` with `raise_server_exceptions=False`.

- [ ] **Step 2: Run API tests to verify missing schemas/app failure**

Run: `uv run pytest tests/test_api.py -q`

Expected: FAIL because schemas and app do not exist.

- [ ] **Step 3: Implement exact Pydantic response models**

Create `Demographics`, `ZipCode`, `Market`, `Pagination`, `Photo`, `Comment`, `Listing`, and `ListingsResponse` models with the exact Django field names. Use `datetime` for `listed_at` and `created_at`, `int` for scores/counts/numeric fields, and `list[Photo]`/`list[Comment]` nested types.

- [ ] **Step 4: Implement lifespan, dependencies, and routes**

Use these exact route constraints:

```python
ZipPath = Annotated[str, Path(pattern=r"^[0-9]{5}$")]
LimitQuery = Annotated[int, Query(ge=1, le=50)]
OffsetQuery = Annotated[int, Query(ge=0, le=199)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]
```

Lifespan must set `app.state.settings`, `app.state.engine`, `app.state.session_factory`, and `app.state.repository`, then always `await engine.dispose()` in `finally`. The listing route awaits `repository.get_listings`, catches only `ZipCodeNotFound`, and raises `HTTPException(404, "ZIP code not found")`. The health route catches `SQLAlchemyError`, logs with `logger.exception`, and returns:

```python
JSONResponse(status_code=503, content={"detail": "Zellit dataset is not ready"})
```

Return `ListingsResponse` through `response_model=ListingsResponse`. Do not catch broad exceptions.

- [ ] **Step 5: Add a lifecycle disposal assertion**

Monkeypatch `build_engine` to return a fake object with `dispose = AsyncMock()`, run `create_app()` inside `with TestClient(app):`, and assert disposal was awaited once after leaving the context.

- [ ] **Step 6: Run API, lifecycle, and integration suites**

Run:

```bash
TEST_DATABASE_URL=postgresql+asyncpg://postgres@localhost:55433/postgres uv run pytest -q
```

Expected: all FastAPI Zellit tests pass, including standard `422`, stable `404`, stable health `503`, unmasked endpoint `500`, and engine disposal.

- [ ] **Step 7: Commit the HTTP application**

```bash
git add research/demo/fastapi/zellit/src/zellit_api research/demo/fastapi/zellit/tests
git commit -m "feat: expose FastAPI Zellit listings API"
```

---

### Task 6: Build the Fully Isolated Compose Stack

**Files:**
- Create: `research/demo/fastapi/zellit/Dockerfile`
- Modify: `research/demo/fastapi/zellit/compose.yaml`
- Create: `research/demo/fastapi/zellit/scripts/smoke.sh`

**Interfaces:**
- Consumes: app/migrations, unchanged shared data image and loader, unchanged shared benchmark image.
- Produces: healthy `api`, one-shot `migrate`/`dataset`/`seed`, optional `artillery`, and isolated `fastapi-postgres-data`/`fastapi-zellit-generated` volumes.

- [ ] **Step 1: Write the smoke script before completing Compose**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cleanup() { docker compose down -v --remove-orphans; }
trap cleanup EXIT

docker compose down -v --remove-orphans
docker compose up --build --wait api
response="$(curl --fail --silent --show-error 'http://127.0.0.1:8000/api/v1/zip-codes/46201/listings?limit=20&offset=0')"
python3 - "$response" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["zip_code"]["code"] == "46201"
assert payload["market"]["listing_count"] == 200
assert payload["pagination"] == {"limit": 20, "offset": 0, "returned": 20}
assert len(payload["listings"]) == 20
assert all(len(item["photos"]) == 4 for item in payload["listings"])
assert all(len(item["comments"]) == 3 for item in payload["listings"])
assert all(item["comment_count"] == 3 for item in payload["listings"])
PY
curl --fail --silent --show-error http://127.0.0.1:8000/health \
  | python3 -c 'import json,sys; assert json.load(sys.stdin) == {"status":"ready"}'
```

Make it executable.

- [ ] **Step 2: Run smoke and verify Compose is incomplete**

Run: `./scripts/smoke.sh`

Expected: FAIL because migration, seed, and API services/images are not yet defined.

- [ ] **Step 3: Create the locked application image**

```dockerfile
FROM ghcr.io/astral-sh/uv:0.11.26 AS uv
FROM python:3.12.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=uv /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY alembic.ini ./
COPY migrations ./migrations
COPY src ./src
RUN uv sync --frozen --no-dev
EXPOSE 8000
CMD ["uv", "run", "--frozen", "uvicorn", "zellit_api.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
```

- [ ] **Step 4: Extend Compose with all isolated services**

Use `postgres:18.1`; set application `DATABASE_URL=postgresql+asyncpg://postgres@db:5432/postgres`; pass shared `../../shared/zellit/data/dataset.env` to migrate and API. Define:

- `migrate`: application image, `uv run --frozen alembic upgrade head`, depends on healthy `db`.
- `dataset`: build `../../shared/zellit`, command `generate --spec /app/data/spec.json --output /data/generated --zip-input /app/data/zip_codes.csv`, volume `fastapi-zellit-generated:/data/generated`.
- `seed`: image `zellit-data:local`, unchanged `seed --database-url postgresql://postgres@db:5432/postgres --data-dir /data/generated --manifest /app/data/manifest.json --if-needed`, depends on healthy DB and completed migration/dataset.
- `api`: application image, depends on completed seed, publishes `127.0.0.1:${API_PORT:-8000}:8000`, and health-checks `/health`.
- `artillery`: profile `benchmark`, build `../../shared/zellit/benchmark`, target-facing environment identical to Django's Artillery service, and mounts the same request corpus and results directory.

Set `DB_POOL_SIZE=20` and `DB_MAX_OVERFLOW=0` explicitly for API. Keep volume names `fastapi-postgres-data` and `fastapi-zellit-generated`.

- [ ] **Step 5: Run fresh-stack smoke**

Run: `./scripts/smoke.sh`

Expected: fresh volumes migrate, generate, seed, API becomes healthy, the canonical response assertions pass, and cleanup removes the isolated stack and volumes.

- [ ] **Step 6: Confirm Compose does not reference Django state**

Run:

```bash
if rg -n 'django/zellit|django-postgres|django.*volume' compose.yaml; then exit 1; fi
docker compose config --quiet
```

Expected: no matches and valid Compose configuration.

- [ ] **Step 7: Commit isolated orchestration**

```bash
git add research/demo/fastapi/zellit/Dockerfile research/demo/fastapi/zellit/compose.yaml research/demo/fastapi/zellit/scripts/smoke.sh
git commit -m "feat: add isolated FastAPI Zellit stack"
```

---

### Task 7: Add Fixed FastAPI Runtime Metadata and Compose Benchmark Runner

**Files:**
- Create: `research/demo/shared/zellit/benchmark/scripts/render-fastapi-runtime.mjs`
- Create: `research/demo/shared/zellit/benchmark/scripts/run-fastapi-compose.sh`
- Create: `research/demo/shared/zellit/benchmark/test/fastapi-runtime.test.mjs`
- Modify: `research/demo/shared/zellit/benchmark/test/benchmark.test.mjs`

**Interfaces:**
- Produces: `renderFastapiRuntime(outputPath) -> Promise<object>` and `run-fastapi-compose.sh PROFILE`.
- Consumes: existing `run.sh`, metadata schema, Compose `api`/`db`/`dataset`/`artillery`, shared request corpus, and result directory.

- [ ] **Step 1: Write failing fixed-runtime tests**

```javascript
// test/fastapi-runtime.test.mjs
import assert from 'node:assert/strict'
import {mkdtemp, readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

import {renderFastapiRuntime} from '../scripts/render-fastapi-runtime.mjs'

const benchmarkDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('FastAPI runtime identity is fixed and complete', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fastapi-runtime-'))
  const output = path.join(directory, 'runtime.json')
  const value = await renderFastapiRuntime(output)
  assert.deepEqual(value, {
    runtime_label: 'uvicorn-1', server: 'uvicorn', workers: 1,
    concurrency_model: 'asyncio', database_access: 'sqlalchemy-async',
    database_driver: 'asyncpg', pool_size: 20, max_overflow: 0,
  })
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), value)
})

test('FastAPI runner rejects missing profile before Docker', () => {
  const script = path.join(benchmarkDir, 'scripts/run-fastapi-compose.sh')
  const result = spawnSync('bash', [script], {encoding: 'utf8'})
  assert.equal(result.status, 2)
  assert.match(result.stderr, /Usage:/)
})

test('FastAPI runner guards overload before Docker', () => {
  const script = path.join(benchmarkDir, 'scripts/run-fastapi-compose.sh')
  const result = spawnSync('bash', [script, 'overload'], {encoding: 'utf8'})
  assert.equal(result.status, 2)
  assert.match(result.stderr, /ENABLE_OVERLOAD=1/)
})
```

- [ ] **Step 2: Run Node tests to verify missing files fail**

Run:

```bash
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use
corepack pnpm test
```

Expected: FAIL because the FastAPI runtime renderer and runner do not exist.

- [ ] **Step 3: Implement the fixed runtime renderer**

`render-fastapi-runtime.mjs` must export the exact object asserted above, create the output directory, write pretty JSON plus a trailing newline, reject a missing output path, and expose a CLI usage of `node scripts/render-fastapi-runtime.mjs OUTPUT_PATH`.

- [ ] **Step 4: Implement the dedicated Compose runner**

Base orchestration and trap behavior on the existing Django runner, but use:

```bash
usage() { echo "Usage: $0 <smoke|baseline|staircase|sustained|overload>" >&2; exit 2; }
COMPOSE_DIR="$REPO_ROOT/research/demo/fastapi/zellit"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${PROFILE}-uvicorn-1}"
compose() { (cd "$COMPOSE_DIR" && docker compose "$@"); }
node "$SCRIPT_DIR/render-fastapi-runtime.mjs" "$RUNTIME_JSON"
export RUNTIME_JSON_VALUE="$(cat "$RUNTIME_JSON")"
```

Validate profile presence and overload opt-in before creating the temp directory or calling `compose`. Start with `compose up --build --wait api`. Discover versions with `importlib.metadata.version()` for `fastapi`, `SQLAlchemy`, `asyncpg`, and `uvicorn`; discover Python and PostgreSQL from their containers. Record API, data, Artillery, and PostgreSQL image IDs.

Build `RUN_METADATA_JSON` with:

```javascript
{
  git_revision: e.GIT_REVISION,
  alphakit_revision: 'not-applicable',
  implementation: 'fastapi-zellit',
  dataset: {
    schema_version: '1', generator_version: '1', seed: 20260813,
    digest: 'd631bfe327777c65a45098f536c9124c822a854480352e5f4564ce62946f3862'
  },
  request_corpus: {sha256: e.CORPUS_SHA256, rows: 500},
  versions: {
    python: e.PYTHON_VERSION, fastapi: e.FASTAPI_VERSION,
    sqlalchemy: e.SQLALCHEMY_VERSION, asyncpg: e.ASYNCPG_VERSION,
    uvicorn: e.UVICORN_VERSION, postgresql: e.POSTGRES_VERSION
  },
  images: {
    fastapi: e.FASTAPI_IMAGE, data: e.DATA_IMAGE,
    artillery: e.ARTILLERY_IMAGE, postgresql: e.POSTGRES_IMAGE
  },
  resource_limits: process.env.RESOURCE_LIMITS || null,
  notes: process.env.BENCHMARK_NOTES || ''
}
```

Finally run `compose --profile benchmark run --rm artillery "$PROFILE" http://api:8000`. Honor `CLEANUP=1`, remove the temporary runtime directory in all cases, and preserve benchmark results.

- [ ] **Step 5: Add static runner regression assertions**

Append a test to `benchmark.test.mjs` that reads both Compose runners and asserts:

```javascript
assert.match(fastapiRunner, /research\/demo\/fastapi\/zellit/)
assert.match(fastapiRunner, /implementation: 'fastapi-zellit'/)
assert.match(fastapiRunner, /render-fastapi-runtime\.mjs/)
assert.match(fastapiRunner, /http:\/\/api:8000/)
assert.doesNotMatch(fastapiRunner, /render-runtime\.mjs/)
assert.match(djangoRunner, /research\/demo\/django\/zellit/)
```

- [ ] **Step 6: Run the complete benchmark harness suite**

Run: `corepack pnpm test`

Expected: all existing 26 tests plus the new FastAPI runtime/runner tests pass; Django runtime tests remain unchanged.

- [ ] **Step 7: Commit benchmark integration**

```bash
git add research/demo/shared/zellit/benchmark/scripts research/demo/shared/zellit/benchmark/test
git commit -m "feat: benchmark FastAPI Zellit compose stack"
```

---

### Task 8: Document and Verify the Fresh-Checkout Workflow

**Files:**
- Create: `research/demo/fastapi/zellit/README.md`
- Modify: `research/demo/shared/zellit/README.md`

**Interfaces:**
- Documents the exact test, Compose, smoke, host-run, and FastAPI Compose benchmark commands delivered by prior tasks.

- [ ] **Step 1: Write operator documentation**

Document these commands with their working directories:

```bash
cd research/demo/fastapi/zellit
uv sync --frozen
docker compose up -d --wait db
TEST_DATABASE_URL=postgresql+asyncpg://postgres@localhost:55433/postgres uv run pytest -q
./scripts/smoke.sh

cd ../../shared/zellit/benchmark
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use
corepack pnpm install --frozen-lockfile
corepack pnpm test
RUN_ID=fastapi-zellit-smoke CLEANUP=1 ./scripts/run-fastapi-compose.sh smoke
```

Explain the endpoint, health contract, five-query parity constraint, one-worker runtime, pool 20/no overflow, isolated volumes, result files, overload opt-in, and smoke-only interpretation. Add the FastAPI runner example to shared Zellit's Artillery section without altering Django examples.

- [ ] **Step 2: Run formatting and static checks**

Run:

```bash
cd research/demo/fastapi/zellit
uv run python -m compileall -q src tests migrations
uv lock --check
git diff --check
```

Expected: compilation, lock, and whitespace checks pass.

- [ ] **Step 3: Run all non-system regression suites**

Run:

```bash
cd research/demo/fastapi/zellit
TEST_DATABASE_URL=postgresql+asyncpg://postgres@localhost:55433/postgres uv run pytest -q

cd ../../shared/zellit
uv run pytest -q

cd benchmark
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use
corepack pnpm test

cd ../../../fastapi/zip
uv run pytest -q -m 'not integration'
```

Expected: FastAPI Zellit tests, shared Zellit tests, all benchmark tests, and FastAPI ZIP unit tests pass.

- [ ] **Step 4: Run fresh Compose and Artillery smoke acceptance**

Run from `research/demo/fastapi/zellit`:

```bash
./scripts/smoke.sh
```

Then from `research/demo/shared/zellit/benchmark`:

```bash
RUN_ID=fastapi-zellit-acceptance CLEANUP=1 ./scripts/run-fastapi-compose.sh smoke
```

Expected: both commands exit zero; the benchmark result directory contains `config.json`, `raw.json`, `metadata.json`, and `runtime.json`; metadata identifies `fastapi-zellit`; runtime identifies `uvicorn-1`, one worker, pool size 20, and zero overflow. Do not interpret smoke latency or throughput.

- [ ] **Step 5: Inspect isolation and repository state**

Run:

```bash
git diff --check
git status --short
rg -n 'django/zellit' research/demo/fastapi/zellit || true
```

Expected: only intentional README comparison wording may mention Django; Compose, application, and scripts contain no Django runtime or volume dependency.

- [ ] **Step 6: Commit documentation**

```bash
git add research/demo/fastapi/zellit/README.md research/demo/shared/zellit/README.md
git commit -m "docs: document FastAPI Zellit workflow"
```

---

### Task 9: Final Verification and Review Preparation

**Files:**
- No planned source changes; only fix defects exposed by verification in the task that owns them.

**Interfaces:**
- Produces a clean branch with reproducible test evidence, ready for code review.

- [ ] **Step 1: Verify every committed deliverable from a clean state**

Run:

```bash
git status --short
docker compose -f research/demo/fastapi/zellit/compose.yaml down -v --remove-orphans || true
cd research/demo/fastapi/zellit
uv sync --frozen
./scripts/smoke.sh
TEST_DATABASE_URL=postgresql+asyncpg://postgres@localhost:55433/postgres uv run pytest -q
```

If `smoke.sh` cleanup removed PostgreSQL before pytest, start only `db`, reapply Alembic, then run pytest:

```bash
docker compose up -d --wait db
DATABASE_URL=postgresql+asyncpg://postgres@localhost:55433/postgres uv run alembic upgrade head
TEST_DATABASE_URL=postgresql+asyncpg://postgres@localhost:55433/postgres uv run pytest -q
```

Expected: clean uv sync, smoke success, and full FastAPI Zellit suite success.

- [ ] **Step 2: Verify shared regressions and one final Artillery smoke**

Run:

```bash
cd research/demo/shared/zellit
uv sync --frozen
uv run pytest -q
cd benchmark
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use
corepack pnpm install --frozen-lockfile
corepack pnpm test
RUN_ID=fastapi-zellit-final-smoke CLEANUP=1 ./scripts/run-fastapi-compose.sh smoke
```

Expected: all shared tests and harness tests pass, then Artillery smoke exits zero with no processor failures.

- [ ] **Step 3: Verify the final diff and commit sequence**

Run:

```bash
git status --short
git diff --check
git log --oneline --decorate main..HEAD
```

Expected: no uncommitted files, no whitespace errors, and focused commits corresponding to project setup, lifecycle, schema, repository, HTTP app, Compose, benchmark integration, and docs.

- [ ] **Step 4: Request code review**

Use the `superpowers:requesting-code-review` skill. Give the reviewer the approved design spec, this plan, commit range `main..HEAD`, exact verification commands, and the caveat that Artillery smoke proves correctness only.
