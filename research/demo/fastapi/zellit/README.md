# FastAPI Zellit benchmark demo

This isolated demo serves the shared Zellit PostgreSQL dataset through FastAPI,
async SQLAlchemy, and asyncpg. It exposes the same measured contract as Django:

```text
GET /api/v1/zip-codes/{five-digit ZIP}/listings?limit=20&offset=0
GET /health
```

A successful listings request uses exactly five SQL statements. This is a paired
benchmark constraint, not a general FastAPI recommendation.

## Runtime contract

- CPython 3.12.12
- One Uvicorn worker, no reload, and no access log
- Async SQLAlchemy with asyncpg
- Pool size 20 and no overflow
- PostgreSQL 18.1
- FastAPI-owned Alembic schema
- FastAPI-specific Compose project and named volumes

Only deterministic data and benchmark assets under `../../shared/zellit` are
shared with other implementations. The database, generated-data volume,
migration service, seed service, API container, and runtime metadata are
independent.

## Prerequisites

- Docker and Docker Compose
- `uv`
- `nvm` with Node 22.23.2 from the repository `.nvmrc`
- `corepack`

## Python and integration tests

From this directory:

```bash
uv sync --frozen
docker compose up -d --wait db
DATABASE_URL=postgresql+asyncpg://postgres@localhost:55433/postgres \
  uv run alembic upgrade head
TEST_DATABASE_URL=postgresql+asyncpg://postgres@localhost:55433/postgres \
  uv run pytest -q
```

Stop the integration database when finished:

```bash
docker compose down -v --remove-orphans
```

## Fresh-stack smoke test

The smoke script removes only the `fastapi-zellit` Compose project and its
volumes, then migrates, generates, seeds, starts, validates, and cleans up:

```bash
API_PORT=8001 ./scripts/smoke.sh
```

Omit `API_PORT` to use port 8000 when it is available. The smoke assertions
check health, ZIP identity, market cardinality, pagination, and nested listing,
photo, and comment cardinalities.

## Benchmark harness

Load the repository's pinned Node runtime and test the shared harness:

```bash
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
cd "$(git rev-parse --show-toplevel)"
nvm use
cd research/demo/shared/zellit/benchmark
corepack pnpm install --frozen-lockfile
corepack pnpm test
```

Run the FastAPI Compose smoke profile:

```bash
RUN_ID=fastapi-zellit-smoke CLEANUP=1 \
  ./scripts/run-fastapi-compose.sh smoke
```

The runner fixes measured traffic to the internal `http://api:8000` origin and
publishes the host API on port 8001 by default to avoid a concurrently running
Django demo. Override `API_PORT` when needed. Available profiles are `smoke`,
`baseline`, `staircase`, `sustained`, and opt-in `overload`:

```bash
ENABLE_OVERLOAD=1 RUN_ID=fastapi-zellit-overload CLEANUP=1 \
  ./scripts/run-fastapi-compose.sh overload
```

Each run writes `config.json`, `raw.json`, `metadata.json`, and `runtime.json`
under `research/demo/shared/zellit/benchmark/results/<run-id>/`. Metadata records
the Git revision, canonical dataset and request-corpus identity, Python,
FastAPI, SQLAlchemy, asyncpg, Uvicorn, PostgreSQL, image IDs, and the fixed
one-worker/pool runtime.

Run IDs are never overwritten. Smoke output proves request wiring and response
correctness only; do not use it for throughput, latency, or framework-ranking
claims.
