# FastAPI ZIP Typeahead Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible FastAPI endpoint that performs a deterministic, Redis-backed ZIP typeahead lookup and can be exercised by shared Artillery benchmark profiles.

**Architecture:** A shared uv project generates and seeds one canonical 50,000-record ZIP dataset. A separate uv-managed FastAPI service owns only request validation, Redis lookup, response serialization, and health behavior. Shared Artillery scenarios run unchanged from pnpm on the host or through a Docker Compose profile.

**Tech Stack:** CPython 3.14.4, uv 0.9.9 or newer, Faker, redis-py asyncio, FastAPI, Uvicorn, pytest, Docker Compose, Redis 8.2.2, Node.js 22.23.2, pnpm 11.21.0, Artillery 2.0.33.

## Global Constraints

- Use uv for every Python installation, project, dependency, lock, sync, and command operation.
- Pin CPython 3.14.4 in both new Python projects; it is the latest stable CPython resolved through uv during planning, excluding CPython 3.15 prereleases.
- Generate exactly 50,000 unique, sorted, five-digit ASCII ZIP records with a fixed Faker seed of `20260811`.
- Reserve `46201` and `46202` as Indianapolis records.
- Commit the generated JSONL, manifest, environment file, and 100-prefix benchmark corpus.
- Store Redis members as `<ZIP>\t<city>` in one zero-scored sorted set.
- `GET /zip-codes?q=<prefix>` accepts one through five ASCII digits and returns at most 10 ZIP-ordered records.
- Redis lookup failures return `503` without retries; malformed stored data is not translated into an infrastructure error.
- Run one Uvicorn worker without reload for benchmarks.
- Artillery rates mean request arrival rates, not concurrent connections.
- Do not add CPU/memory collection, Django code, Zellit code, slide changes, or benchmark conclusions.
- Preserve the existing uncommitted deletion of `research/demos/decisions.md`; never stage it with this work.

---

## File Structure

### Shared data and seeding project

- Create `research/demo/shared/zip/.python-version` — pins CPython 3.14.4.
- Create `research/demo/shared/zip/pyproject.toml` — shared generator/seeder dependencies and CLI.
- Create `research/demo/shared/zip/uv.lock` — exact Python dependency lock.
- Create `research/demo/shared/zip/src/zip_data/__init__.py` — package exports.
- Create `research/demo/shared/zip/src/zip_data/dataset.py` — deterministic generation, manifest creation, prefix selection, and verification.
- Create `research/demo/shared/zip/src/zip_data/seeder.py` — validated atomic Redis loading.
- Create `research/demo/shared/zip/src/zip_data/cli.py` — `generate`, `verify`, and `seed` commands.
- Create `research/demo/shared/zip/tests/test_dataset.py` — generator and verifier tests.
- Create `research/demo/shared/zip/tests/test_seeder.py` — real-Redis seed and failure tests.
- Create `research/demo/shared/zip/data/zip_codes.jsonl` — canonical generated records.
- Create `research/demo/shared/zip/data/manifest.json` — generation metadata and checksum.
- Create `research/demo/shared/zip/data/dataset.env` — Compose-readable count and checksum.
- Create `research/demo/shared/zip/data/benchmark_prefixes.csv` — 100 deterministic three-digit prefixes.
- Create `research/demo/shared/zip/Dockerfile` — pinned one-shot seed image.

### FastAPI project

- Create `research/demo/fastapi/zip/.python-version` — pins CPython 3.14.4.
- Create `research/demo/fastapi/zip/pyproject.toml` — application and test dependencies.
- Create `research/demo/fastapi/zip/uv.lock` — exact Python dependency lock.
- Create `research/demo/fastapi/zip/src/zip_api/__init__.py` — package marker.
- Create `research/demo/fastapi/zip/src/zip_api/config.py` — environment-backed immutable settings.
- Create `research/demo/fastapi/zip/src/zip_api/repository.py` — Redis lexicographical lookup and readiness checks.
- Create `research/demo/fastapi/zip/src/zip_api/app.py` — app factory, lifespan, routes, validation, and error mapping.
- Create `research/demo/fastapi/zip/tests/conftest.py` — test Redis URL and cleanup fixtures.
- Create `research/demo/fastapi/zip/tests/test_repository.py` — real-Redis repository contract.
- Create `research/demo/fastapi/zip/tests/test_api.py` — HTTP, lifespan, health, and error contract.
- Create `research/demo/fastapi/zip/Dockerfile` — pinned benchmark service image.
- Create `research/demo/fastapi/zip/compose.yaml` — Redis, seed, API, and benchmark services.
- Create `research/demo/fastapi/zip/scripts/smoke.sh` — fresh Compose system verification.
- Create `research/demo/fastapi/zip/README.md` — exact setup, test, run, and benchmark commands.

### Shared Artillery benchmark

- Create `research/demo/shared/zip/benchmark/package.json` — Node/pnpm pin and scripts.
- Create `research/demo/shared/zip/benchmark/pnpm-lock.yaml` — Artillery 2.0.33 lock.
- Create `research/demo/shared/zip/benchmark/profiles.json` — committed default load stages.
- Create `research/demo/shared/zip/benchmark/processor.cjs` — exact response assertion.
- Create `research/demo/shared/zip/benchmark/scripts/render-config.mjs` — profile/environment to Artillery JSON.
- Create `research/demo/shared/zip/benchmark/scripts/write-metadata.mjs` — reproducibility metadata.
- Create `research/demo/shared/zip/benchmark/scripts/run.sh` — host/container benchmark entry point.
- Create `research/demo/shared/zip/benchmark/scripts/run-compose.sh` — host wrapper for Compose execution.
- Create `research/demo/shared/zip/benchmark/test/benchmark.test.mjs` — profile rendering and response assertion tests.
- Create `research/demo/shared/zip/benchmark/Dockerfile` — Node 22.23.2/pnpm benchmark image.
- Create `research/demo/shared/zip/benchmark/results/.gitkeep` — run-output root.
- Create `research/demo/shared/zip/benchmark/results/.gitignore` — ignores local trial runs while allowing selected official artifacts to be force-added.

---

### Task 1: Deterministic canonical ZIP dataset

**Files:**
- Create: `research/demo/shared/zip/.python-version`
- Create: `research/demo/shared/zip/pyproject.toml`
- Create: `research/demo/shared/zip/src/zip_data/__init__.py`
- Create: `research/demo/shared/zip/src/zip_data/dataset.py`
- Create: `research/demo/shared/zip/src/zip_data/cli.py`
- Create: `research/demo/shared/zip/tests/test_dataset.py`
- Generate: `research/demo/shared/zip/uv.lock`
- Generate: `research/demo/shared/zip/data/zip_codes.jsonl`
- Generate: `research/demo/shared/zip/data/manifest.json`
- Generate: `research/demo/shared/zip/data/dataset.env`
- Generate: `research/demo/shared/zip/data/benchmark_prefixes.csv`

**Interfaces:**
- Produces: `generate_dataset(output_dir: Path, *, seed: int = 20260811, count: int = 50_000) -> DatasetManifest`.
- Produces: `verify_dataset(output_dir: Path) -> DatasetManifest`, raising `DatasetVerificationError` on any mismatch.
- Produces: JSONL records with exactly `zip` and `city` keys, `manifest.json`, `dataset.env`, and CSV column `q`.
- Consumes: no project code.

- [ ] **Step 1: Initialize the shared uv project with the resolved stable Python**

Run:

```bash
cd research/demo/shared/zip
uv python install 3.14.4
uv python pin 3.14.4
uv init --lib --name zip-data --no-readme
uv add 'faker>=37'
uv add --dev 'pytest>=8'
```

Then define this script in `pyproject.toml`:

```toml
[project.scripts]
zip-data = "zip_data.cli:main"
```

Expected: `.python-version` contains `3.14.4`, and `uv.lock` resolves exact versions without prereleases.

- [ ] **Step 2: Write failing generator tests**

Create `tests/test_dataset.py` with focused tests built around a small fixture count plus one full-size acceptance test:

```python
import csv
import hashlib
import json
import re
from pathlib import Path

import pytest

from zip_data.dataset import (
    DatasetVerificationError,
    generate_dataset,
    verify_dataset,
)


def read_records(path: Path) -> list[dict[str, str]]:
    return [json.loads(line) for line in path.read_text().splitlines()]


def test_generation_is_deterministic_and_reserves_showcase_records(tmp_path: Path) -> None:
    first = tmp_path / "first"
    second = tmp_path / "second"
    manifest = generate_dataset(first, seed=20260811, count=500)
    repeated = generate_dataset(second, seed=20260811, count=500)

    assert manifest.sha256 == repeated.sha256
    assert (first / "zip_codes.jsonl").read_bytes() == (second / "zip_codes.jsonl").read_bytes()
    records = read_records(first / "zip_codes.jsonl")
    assert {record["zip"]: record["city"] for record in records}["46201"] == "Indianapolis"
    assert {record["zip"]: record["city"] for record in records}["46202"] == "Indianapolis"


def test_full_dataset_and_prefix_corpus_satisfy_contract(tmp_path: Path) -> None:
    manifest = generate_dataset(tmp_path)
    records = read_records(tmp_path / "zip_codes.jsonl")
    zips = [record["zip"] for record in records]

    assert manifest.count == 50_000
    assert len(zips) == len(set(zips)) == 50_000
    assert zips == sorted(zips)
    assert all(re.fullmatch(r"[0-9]{5}", value) for value in zips)

    with (tmp_path / "benchmark_prefixes.csv").open(newline="") as stream:
        prefixes = [row["q"] for row in csv.DictReader(stream)]
    assert len(prefixes) == len(set(prefixes)) == 100
    assert all(sum(value.startswith(prefix) for value in zips) >= 10 for prefix in prefixes)


def test_verifier_rejects_modified_artifact(tmp_path: Path) -> None:
    generate_dataset(tmp_path, count=500)
    with (tmp_path / "zip_codes.jsonl").open("ab") as stream:
        stream.write(b"corruption\n")

    with pytest.raises(DatasetVerificationError, match="checksum"):
        verify_dataset(tmp_path)
```

- [ ] **Step 3: Run the tests and verify the missing-module failure**

Run:

```bash
cd research/demo/shared/zip
uv run pytest tests/test_dataset.py -q
```

Expected: FAIL because `zip_data.dataset` does not exist.

- [ ] **Step 4: Implement deterministic generation and verification**

In `src/zip_data/dataset.py`, define:

```python
from dataclasses import asdict, dataclass
from hashlib import sha256
from importlib.metadata import version
from pathlib import Path
import csv
import json
import re
from collections import Counter

from faker import Faker

SEED = 20260811
COUNT = 50_000
SHOWCASE = {"46201": "Indianapolis", "46202": "Indianapolis"}
ZIP_PATTERN = re.compile(r"[0-9]{5}", re.ASCII)


@dataclass(frozen=True)
class DatasetManifest:
    schema_version: int
    generator_version: int
    seed: int
    count: int
    faker_version: str
    sha256: str


class DatasetVerificationError(ValueError):
    pass
```

Implement generation with these exact rules:

1. Call `Faker.seed(seed)` and `fake.seed_instance(seed)` on `Faker("en_US")`.
2. Start the record dictionary with `SHOWCASE`.
3. Draw `fake.random_int(min=0, max=99_999)`, format it with `f"{number:05d}"`, and skip existing ZIPs.
4. Generate cities with `fake.city().replace("\t", " ").replace("\r", " ").replace("\n", " ")`.
5. Serialize records in ZIP order with `json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n"`.
6. Hash the final JSONL bytes with SHA-256.
7. Let `desired_prefixes = min(100, len(eligible))`. For the canonical dataset, select 100 evenly distributed entries from sorted eligible three-digit prefixes. For reduced test datasets, allow fewer eligible prefixes; handle zero and one eligible prefix without division. For two or more, use indices `round(i * (len(eligible) - 1) / (desired_prefixes - 1))`.
8. Write `benchmark_prefixes.csv` with header `q`; `verify_dataset()` requires exactly 100 entries when manifest count is 50,000.
9. Write a sorted, indented `manifest.json` plus newline.
10. Write `dataset.env` containing `ZIP_DATASET_COUNT=<count>` and `ZIP_DATASET_SHA256=<sha256>`.

Implement `verify_dataset()` to validate manifest shape, byte checksum, count, ordering, uniqueness, ASCII ZIP format, showcase values, environment values, and prefix eligibility. Export the public names from `src/zip_data/__init__.py`.

Implement `src/zip_data/cli.py` with `argparse` subcommands:

```text
zip-data generate --output data --seed 20260811 --count 50000
zip-data verify --output data
```

Both successful commands print the manifest JSON; verification failures exit nonzero.

- [ ] **Step 5: Run tests, generate canonical artifacts, and verify them**

Run:

```bash
cd research/demo/shared/zip
uv run pytest tests/test_dataset.py -q
uv run zip-data generate --output data --seed 20260811 --count 50000
uv run zip-data verify --output data
sha256sum data/zip_codes.jsonl
```

Expected: tests PASS; verification exits zero; `data/zip_codes.jsonl` has 50,000 lines; the printed SHA matches both `manifest.json` and `dataset.env`.

- [ ] **Step 6: Commit the canonical dataset unit**

Run from the repository root:

```bash
git add research/demo/shared/zip/.python-version \
  research/demo/shared/zip/pyproject.toml \
  research/demo/shared/zip/uv.lock \
  research/demo/shared/zip/src \
  research/demo/shared/zip/tests/test_dataset.py \
  research/demo/shared/zip/data
git commit -m "feat: add canonical ZIP benchmark dataset"
```

Expected: the commit excludes `research/demos/decisions.md`.

---

### Task 2: Atomic Redis seed service

**Files:**
- Create: `research/demo/shared/zip/src/zip_data/seeder.py`
- Modify: `research/demo/shared/zip/src/zip_data/cli.py`
- Modify: `research/demo/shared/zip/src/zip_data/__init__.py`
- Modify: `research/demo/shared/zip/pyproject.toml`
- Modify: `research/demo/shared/zip/uv.lock`
- Create: `research/demo/shared/zip/tests/test_seeder.py`
- Create: `research/demo/shared/zip/Dockerfile`
- Create: `research/demo/fastapi/zip/compose.yaml`

**Interfaces:**
- Consumes: canonical `zip_codes.jsonl` and `manifest.json` from Task 1.
- Produces: `seed_redis(redis_url: str, data_dir: Path, *, data_key: str = "zip-codes:v1", metadata_key: str = "zip-codes:v1:meta") -> None`.
- Produces: Redis sorted-set members `<ZIP>\t<city>` and metadata hash fields `count` and `sha256`.

- [ ] **Step 1: Add redis-py and write failing real-Redis tests**

Run:

```bash
cd research/demo/shared/zip
uv add 'redis>=6'
```

Create `tests/test_seeder.py`:

```python
import json
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
```

- [ ] **Step 2: Add a minimal Redis Compose service and verify tests fail**

Create `research/demo/fastapi/zip/compose.yaml` initially with:

```yaml
services:
  redis:
    image: redis:8.2.2-alpine
    command: ["redis-server", "--save", "", "--appendonly", "no"]
    ports:
      - "${REDIS_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 1s
      timeout: 1s
      retries: 30
```

Run:

```bash
cd research/demo/fastapi/zip
docker compose up -d --wait redis
cd ../../shared/zip
TEST_REDIS_URL=redis://localhost:6379/15 uv run pytest tests/test_seeder.py -q
```

Expected: FAIL because `zip_data.seeder` does not exist.

- [ ] **Step 3: Implement validated, atomic seeding**

In `seeder.py`:

- Call `verify_dataset(data_dir)` before connecting.
- Parse every JSONL line and reject missing keys, extra keys, tabs/newlines, invalid ZIPs, duplicates, or a count mismatch.
- Create unique temporary keys using `uuid.uuid4().hex`.
- Load sorted-set members in batches of 1,000 with `zadd`.
- Write temporary metadata and verify the temporary sorted-set cardinality.
- Promote both keys in one transactional pipeline with `delete(data_key, metadata_key)`, `rename(temp_data, data_key)`, and `rename(temp_metadata, metadata_key)`.
- Disable retries by constructing `redis.Redis.from_url(redis_url, decode_responses=True, retry_on_timeout=False)`.
- In `finally`, delete temporary keys and close the client.
- Wrap verification, JSON, and Redis failures in `SeedError` while preserving the original exception as `__cause__`.

Add `seed` to the CLI:

```text
zip-data seed --redis-url redis://redis:6379/0 --data-dir /data
```

- [ ] **Step 4: Complete and build the seed image**

Create `research/demo/shared/zip/Dockerfile`:

```dockerfile
FROM ghcr.io/astral-sh/uv:0.9.9 AS uv
FROM python:3.14.4-slim-bookworm
COPY --from=uv /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev
ENTRYPOINT ["uv", "run", "--frozen", "zip-data"]
```

Run:

```bash
cd research/demo/shared/zip
TEST_REDIS_URL=redis://localhost:6379/15 uv run pytest tests/test_seeder.py -q
uv run pytest -q
docker build -t django-con-zip-seed:test .
cd ../../fastapi/zip
docker compose down -v
```

Expected: all shared-project tests PASS and the image builds.

- [ ] **Step 5: Commit the seed unit**

```bash
git add research/demo/shared/zip research/demo/fastapi/zip/compose.yaml
git commit -m "feat: add atomic Redis ZIP seeding"
```

Expected: only Task 2 paths are committed.

---

### Task 3: Redis ZIP repository

**Files:**
- Create: `research/demo/fastapi/zip/.python-version`
- Create: `research/demo/fastapi/zip/pyproject.toml`
- Create: `research/demo/fastapi/zip/uv.lock`
- Create: `research/demo/fastapi/zip/src/zip_api/__init__.py`
- Create: `research/demo/fastapi/zip/src/zip_api/config.py`
- Create: `research/demo/fastapi/zip/src/zip_api/repository.py`
- Create: `research/demo/fastapi/zip/tests/conftest.py`
- Create: `research/demo/fastapi/zip/tests/test_repository.py`

**Interfaces:**
- Produces: `Settings(redis_url: str, data_key: str, metadata_key: str, expected_count: int, expected_sha256: str)`.
- Produces: `ZipEntry(zip: str, city: str)`.
- Produces: `RedisZipRepository.lookup(prefix: str, limit: int = 10) -> list[ZipEntry]` and `RedisZipRepository.is_ready() -> bool`, both async.
- Consumes: Redis keys and metadata from Task 2.

- [ ] **Step 1: Initialize the FastAPI uv project and dependencies**

Run:

```bash
cd research/demo/fastapi/zip
uv python install 3.14.4
uv python pin 3.14.4
uv init --lib --name zip-api --no-readme
uv add 'fastapi>=0.141' 'redis>=6' 'uvicorn>=0.35'
uv add --dev 'pytest>=8' 'pytest-asyncio>=0.24' 'httpx>=0.28'
```

Replace the generated package name with `src/zip_api/`, and configure pytest:

```toml
[tool.pytest.ini_options]
addopts = "-ra"
asyncio_mode = "auto"
markers = ["integration: requires the Compose Redis service"]
```

- [ ] **Step 2: Write failing real-Redis repository tests**

Create fixtures in `tests/conftest.py` that construct `redis.asyncio.Redis` from `TEST_REDIS_URL` defaulting to `redis://localhost:6379/15`, flush DB 15 before and after each integration test, and close with `await client.aclose()`.

Create `tests/test_repository.py`:

```python
import pytest

from zip_api.config import Settings
from zip_api.repository import RedisZipRepository, ZipEntry

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


async def test_readiness_requires_matching_metadata_and_cardinality(redis_client, settings) -> None:
    await redis_client.zadd(settings.data_key, {f"{index:05d}\tCity": 0 for index in range(12)})
    await redis_client.hset(settings.metadata_key, mapping={"count": "12", "sha256": "expected-sha"})
    repository = RedisZipRepository(redis_client, settings)

    assert await repository.is_ready() is True
    await redis_client.hset(settings.metadata_key, "sha256", "wrong")
    assert await repository.is_ready() is False
```

Also test that a malformed member raises `StoredZipDataError` rather than a Redis exception.

- [ ] **Step 3: Run repository tests and verify failure**

```bash
cd research/demo/fastapi/zip
docker compose up -d --wait redis
TEST_REDIS_URL=redis://localhost:6379/15 uv run pytest tests/test_repository.py -q
```

Expected: FAIL because `zip_api.config` and `zip_api.repository` do not exist.

- [ ] **Step 4: Implement settings and repository**

Create immutable `Settings` in `config.py`, including `Settings.from_env()` reading:

```text
REDIS_URL
ZIP_DATA_KEY
ZIP_METADATA_KEY
ZIP_DATASET_COUNT
ZIP_DATASET_SHA256
```

Defaults are `redis://localhost:6379/0`, `zip-codes:v1`, `zip-codes:v1:meta`, and `50000`; `ZIP_DATASET_SHA256` is required when loading from the environment.

In `repository.py`, define:

```python
@dataclass(frozen=True)
class ZipEntry:
    zip: str
    city: str


class StoredZipDataError(ValueError):
    pass
```

`lookup()` must call exactly one Redis command:

```python
members = await client.zrange(
    settings.data_key,
    f"[{prefix}",
    f"[{prefix}\xff",
    bylex=True,
    offset=0,
    num=limit,
)
```

Decode each member with `partition("\t")`; reject missing separators or non-five-digit ASCII ZIPs with `StoredZipDataError`. Do not catch `redis.exceptions.RedisError` in this layer.

`is_ready()` pipelines `ping`, `zcard`, and `hgetall`, then compares cardinality, metadata count, and checksum against settings. It returns `False` for a valid Redis response with wrong metadata; Redis transport errors propagate.

- [ ] **Step 5: Run tests and commit**

```bash
cd research/demo/fastapi/zip
TEST_REDIS_URL=redis://localhost:6379/15 uv run pytest tests/test_repository.py -q
uv run pytest -q
git add .python-version pyproject.toml uv.lock src tests
git commit -m "feat: add Redis ZIP repository"
```

Expected: repository tests PASS; the commit is scoped to `research/demo/fastapi/zip`.

---

### Task 4: FastAPI HTTP and lifespan contract

**Files:**
- Create: `research/demo/fastapi/zip/src/zip_api/app.py`
- Modify: `research/demo/fastapi/zip/src/zip_api/__init__.py`
- Create: `research/demo/fastapi/zip/tests/test_api.py`

**Interfaces:**
- Consumes: `Settings`, `RedisZipRepository`, and `ZipEntry` from Task 3.
- Produces: `create_app(settings: Settings | None = None) -> FastAPI` and module-level `app` for Uvicorn.
- Produces: `GET /zip-codes` and `GET /health`.

- [ ] **Step 1: Write failing API contract tests**

Use a protocol-compatible stub repository and override `app.state.repository` inside a `TestClient` context. Include these tests in `tests/test_api.py`:

```python
from fastapi.testclient import TestClient
import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from zip_api.app import create_app
from zip_api.config import Settings
from zip_api.repository import StoredZipDataError, ZipEntry


class StubRepository:
    def __init__(self, entries=None, *, ready=True, error=None):
        self.entries = entries or []
        self.ready = ready
        self.error = error

    async def lookup(self, prefix: str, limit: int = 10):
        if self.error:
            raise self.error
        return self.entries

    async def is_ready(self) -> bool:
        if self.error:
            raise self.error
        return self.ready


def make_settings() -> Settings:
    return Settings("redis://unused", "data", "meta", 2, "sha")


def test_zip_lookup_contract() -> None:
    app = create_app(make_settings())
    with TestClient(app) as client:
        app.state.repository = StubRepository([
            ZipEntry("46201", "Indianapolis"),
            ZipEntry("46202", "Indianapolis"),
        ])
        response = client.get("/zip-codes", params={"q": "462"})

    assert response.status_code == 200
    assert response.json() == [
        {"zip": "46201", "city": "Indianapolis"},
        {"zip": "46202", "city": "Indianapolis"},
    ]


@pytest.mark.parametrize("query", ["", "123456", "12a", "１２３", "-1", "12 3"])
def test_zip_lookup_rejects_invalid_queries(query: str) -> None:
    app = create_app(make_settings())
    with TestClient(app) as client:
        app.state.repository = StubRepository()
        response = client.get("/zip-codes", params={"q": query})
    assert response.status_code == 422


def test_redis_failure_has_stable_503() -> None:
    app = create_app(make_settings())
    with TestClient(app) as client:
        app.state.repository = StubRepository(error=RedisConnectionError("down"))
        response = client.get("/zip-codes", params={"q": "462"})
    assert response.status_code == 503
    assert response.json() == {"detail": "ZIP lookup temporarily unavailable"}


def test_malformed_data_is_not_mislabeled_as_redis_failure() -> None:
    app = create_app(make_settings())
    with TestClient(app, raise_server_exceptions=False) as client:
        app.state.repository = StubRepository(error=StoredZipDataError("bad member"))
        response = client.get("/zip-codes", params={"q": "462"})
    assert response.status_code == 500
```

Also test missing `q`, `[]`, one- and five-digit valid queries, ready health `200`, not-ready health `503`, Redis health failure `503`, and that the lifespan-created Redis client is closed when the context exits.

- [ ] **Step 2: Run tests and verify the missing-app failure**

```bash
cd research/demo/fastapi/zip
uv run pytest tests/test_api.py -q
```

Expected: FAIL because `zip_api.app` does not exist.

- [ ] **Step 3: Implement the app factory and typed responses**

In `app.py`:

- Define `ZipResponse(BaseModel)` with `zip: str` and `city: str`.
- Use `Annotated[str, Query(pattern=r"^[0-9]{1,5}$")]` for `q`.
- Define an `@asynccontextmanager` lifespan that creates `redis.asyncio.Redis.from_url(..., decode_responses=True, retry_on_timeout=False)`, stores the repository on `app.state`, yields, then calls `await client.aclose()`.
- Accept explicit `Settings` in `create_app()` for tests; module-level `app` calls `Settings.from_env()` lazily inside lifespan so importing the module does not require environment variables.
- Catch only `redis.exceptions.RedisError` around repository calls, log the exception with `logger.exception()`, and do not retry.
- Return the agreed `503` lookup body.
- Return `{"status": "ready"}` from healthy `/health`; return `503` with `{"detail": "ZIP dataset is not ready"}` for false readiness or Redis errors.
- Configure `response_model=list[ZipResponse]` on `/zip-codes`.

- [ ] **Step 4: Run API tests and the complete Python suite**

```bash
cd research/demo/fastapi/zip
uv run pytest tests/test_api.py -q
TEST_REDIS_URL=redis://localhost:6379/15 uv run pytest -q
```

Expected: all API and repository tests PASS.

- [ ] **Step 5: Commit the HTTP unit**

```bash
git add research/demo/fastapi/zip/src/zip_api \
  research/demo/fastapi/zip/tests/test_api.py
git commit -m "feat: expose FastAPI ZIP lookup endpoint"
```

---

### Task 5: Reproducible application Compose stack

**Files:**
- Create: `research/demo/fastapi/zip/Dockerfile`
- Modify: `research/demo/fastapi/zip/compose.yaml`
- Create: `research/demo/fastapi/zip/scripts/smoke.sh`

**Interfaces:**
- Consumes: seed image/CLI from Task 2, app from Task 4, and `dataset.env` from Task 1.
- Produces: `docker compose up --build --wait api` and a deterministic smoke command.

- [ ] **Step 1: Write the failing Compose smoke script**

Create executable `scripts/smoke.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cleanup() { docker compose down -v --remove-orphans; }
trap cleanup EXIT

docker compose down -v --remove-orphans
docker compose up --build --wait api
response="$(curl --fail --silent --show-error 'http://localhost:8000/zip-codes?q=462')"
python3 - "$response" <<'PY'
import json
import sys
records = json.loads(sys.argv[1])
assert len(records) == 10, records
by_zip = {record["zip"]: record["city"] for record in records}
assert by_zip["46201"] == "Indianapolis", records
assert by_zip["46202"] == "Indianapolis", records
PY
curl --fail --silent --show-error 'http://localhost:8000/health' \
  | python3 -c 'import json,sys; assert json.load(sys.stdin) == {"status":"ready"}'
```

Run `chmod +x scripts/smoke.sh`.

- [ ] **Step 2: Run smoke and verify image/service failure**

```bash
cd research/demo/fastapi/zip
./scripts/smoke.sh
```

Expected: FAIL because the API and seed services/images are not fully defined.

- [ ] **Step 3: Build the pinned FastAPI image**

Create `Dockerfile`:

```dockerfile
FROM ghcr.io/astral-sh/uv:0.9.9 AS uv
FROM python:3.14.4-slim-bookworm
COPY --from=uv /uv /uvx /bin/
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev
EXPOSE 8000
CMD ["uv", "run", "--frozen", "uvicorn", "zip_api.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
```

- [ ] **Step 4: Complete Compose dependencies and health behavior**

Expand `compose.yaml` so:

- `redis` remains pinned to `redis:8.2.2-alpine`, has persistence disabled, and has the existing health check.
- `seed` builds `../../shared/zip`, mounts `../../shared/zip/data:/data:ro`, loads `../../shared/zip/data/dataset.env`, runs `seed --redis-url redis://redis:6379/0 --data-dir /data`, and depends on healthy Redis.
- `api` builds the current directory, loads `dataset.env`, sets the Redis/key variables, publishes `${API_PORT:-8000}:8000`, depends on `seed` with `condition: service_completed_successfully`, and has a Python-based HTTP health check against `/health` so no curl package is needed.
- All services share the default Compose network and no Redis volume survives `down -v`.

Use explicit values:

```yaml
environment:
  REDIS_URL: redis://redis:6379/0
  ZIP_DATA_KEY: zip-codes:v1
  ZIP_METADATA_KEY: zip-codes:v1:meta
```

- [ ] **Step 5: Run fresh-stack smoke and inspect effective configuration**

```bash
cd research/demo/fastapi/zip
docker compose config --quiet
./scripts/smoke.sh
docker compose down -v --remove-orphans
```

Expected: Compose config is valid; Redis becomes healthy; seed exits zero; API becomes healthy; `q=462` contains both showcase records.

- [ ] **Step 6: Commit the Compose application unit**

```bash
git add research/demo/fastapi/zip/Dockerfile \
  research/demo/fastapi/zip/compose.yaml \
  research/demo/fastapi/zip/scripts/smoke.sh
git commit -m "feat: compose FastAPI ZIP demo stack"
```

---

### Task 6: Shared host-side Artillery profiles

**Files:**
- Create: `research/demo/shared/zip/benchmark/package.json`
- Create: `research/demo/shared/zip/benchmark/pnpm-lock.yaml`
- Create: `research/demo/shared/zip/benchmark/profiles.json`
- Create: `research/demo/shared/zip/benchmark/processor.cjs`
- Create: `research/demo/shared/zip/benchmark/scripts/render-config.mjs`
- Create: `research/demo/shared/zip/benchmark/scripts/write-metadata.mjs`
- Create: `research/demo/shared/zip/benchmark/scripts/run.sh`
- Create: `research/demo/shared/zip/benchmark/test/benchmark.test.mjs`
- Create: `research/demo/shared/zip/benchmark/results/.gitkeep`
- Create: `research/demo/shared/zip/benchmark/results/.gitignore`

**Interfaces:**
- Consumes: `data/benchmark_prefixes.csv` and any target implementing the ZIP HTTP contract.
- Produces: `./scripts/run.sh <smoke|baseline|staircase|sustained|overload> <target-url>`.
- Produces: `results/<run-id>/config.json`, `metadata.json`, and `raw.json`.

- [ ] **Step 1: Initialize the pinned benchmark package**

Run:

```bash
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use
cd research/demo/shared/zip/benchmark
corepack pnpm init
corepack pnpm add --save-dev artillery@2.0.33
```

Set these exact `package.json` fields:

```json
{
  "private": true,
  "packageManager": "pnpm@11.21.0",
  "engines": {"node": "22.23.2"},
  "scripts": {
    "test": "node --test test/*.test.mjs",
    "benchmark": "bash scripts/run.sh"
  },
  "devDependencies": {"artillery": "2.0.33"}
}
```

- [ ] **Step 2: Write failing profile and processor tests**

Create `profiles.json` with exact defaults:

```json
{
  "smoke": [{"duration": 10, "arrivalRate": 1}],
  "baseline": [{"duration": 60, "arrivalRate": 5}],
  "staircase": [
    {"duration": 20, "arrivalRate": 10, "name": "warm-up"},
    {"duration": 45, "arrivalRate": 25},
    {"duration": 45, "arrivalRate": 50},
    {"duration": 45, "arrivalRate": 100},
    {"duration": 45, "arrivalRate": 200},
    {"duration": 45, "arrivalRate": 400},
    {"duration": 45, "arrivalRate": 800}
  ],
  "sustained": [{"duration": 300, "arrivalRate": 200}],
  "overload": [{"duration": 30, "arrivalRate": 1200}]
}
```

Create `test/benchmark.test.mjs` to assert:

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { buildConfig } from '../scripts/render-config.mjs'
import processor from '../processor.cjs'

test('staircase renders committed rates', async () => {
  const config = await buildConfig('staircase', 'http://api:8000', {})
  assert.deepEqual(config.config.phases.map((phase) => phase.arrivalRate), [10, 25, 50, 100, 200, 400, 800])
  assert.equal(config.scenarios[0].flow[0].get.url, '/zip-codes?q={{ q }}')
})

test('environment overrides sustained rate and duration', async () => {
  const config = await buildConfig('sustained', 'http://localhost:8000', {
    SUSTAINED_RATE: '350',
    SUSTAINED_DURATION: '120'
  })
  assert.deepEqual(config.config.phases, [{duration: 120, arrivalRate: 350}])
})

test('all committed profiles render', async () => {
  for (const profile of ['smoke', 'baseline', 'staircase', 'sustained', 'overload']) {
    const config = await buildConfig(profile, 'http://localhost:8000', {})
    assert.ok(config.config.phases.length > 0)
  }
})

test('response validator rejects wrong payload length', () => {
  assert.throws(() => processor.assertZipResponse({}, {statusCode: 200, body: '[]'}), /10 records/)
})
```

- [ ] **Step 3: Run Node tests and verify failure**

```bash
cd research/demo/shared/zip/benchmark
corepack pnpm test
```

Expected: FAIL because the renderer and processor do not exist.

- [ ] **Step 4: Implement profile rendering and response validation**

`render-config.mjs` exports `buildConfig(profile, target, env)` and when run as a CLI writes JSON to the requested path. It must:

- Reject unknown profiles and non-HTTP(S) targets.
- Load `profiles.json`.
- Apply `SMOKE_RATE`, `SMOKE_DURATION`, `BASELINE_RATE`, `BASELINE_DURATION`, `SUSTAINED_RATE`, `SUSTAINED_DURATION`, `OVERLOAD_RATE`, and `OVERLOAD_DURATION` when present.
- Apply optional comma-separated `STAIRCASE_RATES` to the six measured stages while retaining the warm-up.
- Point Artillery payload configuration to the absolute `benchmark_prefixes.csv` path with field `q`, `skipHeader: true`, and sequential order.
- Point the processor to the absolute `processor.cjs` path.
- Enable the `expect` plugin and configure one GET request followed by `afterResponse: "assertZipResponse"`.

`processor.cjs` exports an Artillery callback and a directly testable validator. The validator must require status `200`, parse JSON, require an array of exactly 10 objects, and require every object to contain only string `zip` and `city` fields with a five-digit ZIP. The Artillery callback catches validation errors, emits `counter` metric `zip.invalid_response`, and calls `next(error)`.

- [ ] **Step 5: Implement run output and metadata**

`write-metadata.mjs` writes sorted, indented JSON containing:

```text
run_id, started_at, completed_at, git_revision, target, profile, node_version,
artillery_version, python_version, application_version, framework_version,
server_version, redis_version, effective_phases, execution_mode
```

`run.sh` must:

1. Require profile and target arguments.
2. Reject `overload` unless `ENABLE_OVERLOAD=1`.
3. Create `results/${RUN_ID:-<UTC timestamp>-<profile>}`.
4. Render `config.json`.
5. Resolve Git revision from `GIT_REVISION` or `git rev-parse HEAD`.
6. Resolve Python, zip-api, FastAPI, Uvicorn, and Redis versions from their corresponding environment variables. In host mode, derive the Compose path as `../../../fastapi/zip/compose.yaml` relative to the benchmark directory and default the values with `docker compose -f "$COMPOSE_FILE" exec -T api python --version`, `importlib.metadata.version()` inside the API container, and `docker compose -f "$COMPOSE_FILE" exec -T redis redis-server --version`. Fail rather than write incomplete version metadata.
7. Write initial `metadata.json` and resolve Artillery with `pnpm exec artillery --version`.
8. Run `pnpm exec artillery run --output raw.json config.json`.
9. Update `metadata.json` with `completed_at` in UTC, preserving all initial fields even when Artillery exits nonzero.
10. Print the result directory and return Artillery's exit status.

Use `results/.gitignore` content:

```gitignore
*
!.gitignore
!.gitkeep
```

- [ ] **Step 6: Run tests and host-side smoke against Compose**

```bash
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use
cd research/demo/shared/zip/benchmark
corepack pnpm test
cd ../../../fastapi/zip
docker compose up --build --wait api
cd ../../shared/zip/benchmark
RUN_ID=host-smoke corepack pnpm benchmark -- smoke http://localhost:8000
test -s results/host-smoke/raw.json
test -s results/host-smoke/metadata.json
cd ../../../fastapi/zip
docker compose down -v --remove-orphans
```

Expected: Node tests PASS; Artillery sends 10 requests with no `zip.invalid_response` counter; raw output and metadata exist.

- [ ] **Step 7: Commit the host benchmark unit without local results**

```bash
git add research/demo/shared/zip/benchmark/package.json \
  research/demo/shared/zip/benchmark/pnpm-lock.yaml \
  research/demo/shared/zip/benchmark/profiles.json \
  research/demo/shared/zip/benchmark/processor.cjs \
  research/demo/shared/zip/benchmark/scripts \
  research/demo/shared/zip/benchmark/test \
  research/demo/shared/zip/benchmark/results/.gitignore \
  research/demo/shared/zip/benchmark/results/.gitkeep
git commit -m "feat: add shared ZIP Artillery profiles"
```

---

### Task 7: Docker-based Artillery execution

**Files:**
- Create: `research/demo/shared/zip/benchmark/Dockerfile`
- Create: `research/demo/shared/zip/benchmark/scripts/run-compose.sh`
- Modify: `research/demo/fastapi/zip/compose.yaml`
- Modify: `research/demo/shared/zip/benchmark/test/benchmark.test.mjs`

**Interfaces:**
- Consumes: benchmark scripts from Task 6 and Compose API from Task 5.
- Produces: `./scripts/run-compose.sh <profile>` with output in the same host `results/` tree.

- [ ] **Step 1: Add a failing wrapper contract test**

Add a Node test that reads `scripts/run-compose.sh` and asserts it:

```javascript
assert.match(script, /--profile benchmark run --rm artillery/)
assert.match(script, /EXECUTION_MODE=docker/)
assert.match(script, /GIT_REVISION=/)
```

Run:

```bash
cd research/demo/shared/zip/benchmark
corepack pnpm test
```

Expected: FAIL because `run-compose.sh` does not exist.

- [ ] **Step 2: Create the pinned benchmark image**

Create `benchmark/Dockerfile`:

```dockerfile
FROM node:22.23.2-bookworm-slim
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate
WORKDIR /benchmark
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY profiles.json processor.cjs ./
COPY scripts ./scripts
ENTRYPOINT ["bash", "scripts/run.sh"]
```

- [ ] **Step 3: Add the optional Compose benchmark service**

Add `artillery` to `compose.yaml` with:

- `profiles: ["benchmark"]`.
- Build context `../../shared/zip/benchmark`.
- Dependency on healthy `api`.
- `TARGET_URL=http://api:8000`.
- Read-only mount of `benchmark_prefixes.csv` at `/data/benchmark_prefixes.csv`.
- Bind mount of host `benchmark/results` at `/benchmark/results`.
- Environment passthrough for `RUN_ID`, `GIT_REVISION`, `PYTHON_VERSION`, `APPLICATION_VERSION`, `FRAMEWORK_VERSION`, `SERVER_VERSION`, `REDIS_VERSION`, profile overrides, `ENABLE_OVERLOAD`, and `EXECUTION_MODE=docker`.

Adjust `render-config.mjs` to use `PREFIX_CORPUS_PATH` when supplied, defaulting to the repository data path for host execution.

- [ ] **Step 4: Implement the host Compose wrapper**

`run-compose.sh` must:

- Require one profile argument.
- Resolve repository root and FastAPI Compose directory without depending on the caller’s working directory.
- Export `GIT_REVISION="$(git rev-parse HEAD)"`.
- Set `RUN_ID` to the caller value or a UTC timestamp plus profile.
- Run `docker compose up --build --wait api`.
- Export `PYTHON_VERSION` from `docker compose exec -T api python --version`.
- Export `APPLICATION_VERSION`, `FRAMEWORK_VERSION`, and `SERVER_VERSION` using `importlib.metadata.version("zip-api")`, `importlib.metadata.version("fastapi")`, and `importlib.metadata.version("uvicorn")` inside the API container.
- Export `REDIS_VERSION` from `docker compose exec -T redis redis-server --version`.
- Run `docker compose --profile benchmark run --rm artillery "$profile" http://api:8000`.
- Preserve the stack for inspection unless `CLEANUP=1`, in which case a trap runs `docker compose down -v --remove-orphans`.

- [ ] **Step 5: Verify Docker benchmark smoke**

```bash
cd research/demo/shared/zip/benchmark
corepack pnpm test
CLEANUP=1 RUN_ID=docker-smoke ./scripts/run-compose.sh smoke
test -s results/docker-smoke/raw.json
test -s results/docker-smoke/metadata.json
python3 - <<'PY'
import json
from pathlib import Path
metadata = json.loads(Path("results/docker-smoke/metadata.json").read_text())
assert metadata["execution_mode"] == "docker"
assert metadata["profile"] == "smoke"
assert metadata["git_revision"]
PY
```

Expected: tests PASS; the Docker Artillery run succeeds and writes host-visible artifacts.

- [ ] **Step 6: Commit Docker benchmark support**

```bash
git add research/demo/shared/zip/benchmark/Dockerfile \
  research/demo/shared/zip/benchmark/scripts/run-compose.sh \
  research/demo/shared/zip/benchmark/scripts/render-config.mjs \
  research/demo/shared/zip/benchmark/test/benchmark.test.mjs \
  research/demo/fastapi/zip/compose.yaml
git commit -m "feat: run ZIP benchmarks through Compose"
```

---

### Task 8: Documentation and full acceptance verification

**Files:**
- Create: `research/demo/fastapi/zip/README.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: a fresh-checkout operator workflow and final verified demo.

- [ ] **Step 1: Write the operator README**

Document these exact workflows:

```bash
repo_root="$(git rev-parse --show-toplevel)"

# Verify canonical data
cd "$repo_root/research/demo/shared/zip"
uv sync --frozen
uv run zip-data verify --output data

# Run Python tests with real Redis
cd "$repo_root/research/demo/fastapi/zip"
docker compose up -d --wait redis
cd "$repo_root/research/demo/shared/zip"
TEST_REDIS_URL=redis://localhost:6379/15 uv run pytest -q
cd "$repo_root/research/demo/fastapi/zip"
TEST_REDIS_URL=redis://localhost:6379/15 uv run pytest -q

# Run the application
cd "$repo_root/research/demo/fastapi/zip"
docker compose up --build --wait api
curl 'http://localhost:8000/zip-codes?q=462'

# Host Artillery smoke
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use
cd "$repo_root/research/demo/shared/zip/benchmark"
corepack pnpm install --frozen-lockfile
corepack pnpm benchmark -- smoke http://localhost:8000

# Compose Artillery smoke and staircase
CLEANUP=1 ./scripts/run-compose.sh smoke
CLEANUP=1 ./scripts/run-compose.sh staircase
```

Explain request-rate semantics, result locations, overload opt-in, sustained overrides, three-run alternating order for future comparisons, and that results describe only this workload.

- [ ] **Step 2: Run formatting and static repository checks**

Run:

```bash
cd research/demo/shared/zip
uv run pytest -q
uv run zip-data verify --output data
cd ../../fastapi/zip
TEST_REDIS_URL=redis://localhost:6379/15 uv run pytest -q
cd ../../shared/zip/benchmark
corepack pnpm test
cd ../../../../..
git diff --check
```

Expected: all tests PASS, dataset verification succeeds, and `git diff --check` emits nothing.

- [ ] **Step 3: Run clean Compose and both Artillery smoke paths**

```bash
cd research/demo/fastapi/zip
./scripts/smoke.sh
docker compose up --build --wait api
cd ../../shared/zip/benchmark
RUN_ID=acceptance-host corepack pnpm benchmark -- smoke http://localhost:8000
CLEANUP=1 RUN_ID=acceptance-docker ./scripts/run-compose.sh smoke
test -s results/acceptance-host/raw.json
test -s results/acceptance-docker/raw.json
```

Expected: fresh stack smoke succeeds and both benchmark execution modes produce nonempty raw results without response-validation errors.

- [ ] **Step 4: Verify pinned versions and service configuration**

Run:

```bash
cd research/demo/fastapi/zip
docker compose config --images
uv python find 3.14.4
uv tree
cd ../../shared/zip
uv tree
cd benchmark
corepack pnpm list --depth 0
```

Expected: Redis resolves to `redis:8.2.2-alpine`; both Python projects resolve CPython 3.14.4 and locked dependencies; Artillery is exactly 2.0.33.

- [ ] **Step 5: Review benchmark output without making a comparison claim**

Inspect only correctness and completeness:

```bash
cd research/demo/shared/zip/benchmark
python3 - <<'PY'
import json
from pathlib import Path
for run_id in ("acceptance-host", "acceptance-docker"):
    raw = json.loads((Path("results") / run_id / "raw.json").read_text())
    assert raw
    metadata = json.loads((Path("results") / run_id / "metadata.json").read_text())
    assert metadata["profile"] == "smoke"
    assert metadata["git_revision"]
print("acceptance artifacts are structurally complete")
PY
```

Expected: output is `acceptance artifacts are structurally complete`. Do not record throughput or latency as a presentation claim from smoke runs.

- [ ] **Step 6: Commit documentation and any acceptance-only fixes**

```bash
git add research/demo/fastapi/zip/README.md
git commit -m "docs: document FastAPI ZIP benchmark demo"
git status --short
```

Expected: the implementation is committed; local result directories remain ignored; `research/demos/decisions.md` remains an unstaged deletion exactly as it was before implementation.
