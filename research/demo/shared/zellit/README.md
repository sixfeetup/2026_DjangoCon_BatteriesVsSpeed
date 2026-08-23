# Zellit shared data and benchmark tools

This uv-managed project owns the framework-neutral deterministic Zellit dataset,
transactional PostgreSQL loader, request corpus, and shared Artillery harness.
It uses CPython 3.12.12, Faker 40.5.1, and fixed seed `20260813`. Framework
implementations consume these artifacts; they do not generate independent data.

## Locked setup

Run from `research/demo/shared/zellit/`:

```sh
uv sync --frozen
uv run pytest -q
```

`pyproject.toml` and `uv.lock` are the dependency contract. The data image pins
uv 0.11.26 and uses the same CPython 3.12.12 patch as the Django image. The
accepted lock resolves psycopg and psycopg-binary 3.3.4 (and Faker 40.5.1).

## Inputs and generated artifacts

`data/spec.json` fixes schema/generator versions, seed, base timestamp, bounded
fields, and all cardinalities. `data/zip_codes.csv` is the sorted, committed
500-ZIP source and includes Indianapolis ZIP `46201`.

Generation writes UTF-8 CSV with LF endings, fixed columns, deterministic
positive IDs, and stable row order:

| Artifact | Columns | Canonical rows |
|---|---|---:|
| `actors.csv` | `id,handle,display_name` | 20,000 |
| `zip_codes.csv` | code, city, state, and five demographic fields | 500 |
| `listings.csv` | ID, ZIP, address, price, dimensions, year, timestamp | 100,000 |
| `photos.csv` | `id,listing_id,url,position` | 400,000 |
| `comments.csv` | `id,listing_id,actor_id,body,created_at` | 300,000 |
| `listing_votes.csv` | `id,listing_id,actor_id,value` | 800,000 |
| `comment_votes.csv` | `id,comment_id,actor_id,value` | 600,000 |

Generate and verify all canonical files:

```sh
uv run zellit-data generate \
  --spec data/spec.json \
  --output data/generated \
  --zip-input data/zip_codes.csv
uv run zellit-data verify \
  --spec data/spec.json \
  --manifest data/manifest.json \
  --output data/generated
```

`data/generated/*.csv` is intentionally ignored by Git. `data/manifest.json`
records each artifact's exact columns, SHA-256, byte count, and row count, then
derives the overall digest from that ordered metadata. Verification fails on any
byte, shape, count, or corpus mismatch. `data/dataset.env` exports the matching
schema version, digest, seed, and readiness counts to Compose.

## Request corpus semantics

`data/benchmark_requests.csv` is committed and contains 500 deterministic
requests: 100 eligible ZIP codes crossed with offsets `0,20,40,60,80`. Every
request uses `limit=20`, addresses a full page from a ZIP with exactly 200
listings, and therefore expects 20 listings, 80 photos, and 60 comments.

The committed corpus SHA-256 is
`b2e6fa0b91ccc3e02e56855e6ec5f475c6b24d241eb165c6c3f509c09cda06e1`.
The processor validates status, requested ZIP and offset, cardinalities, stable
ordering, and integer vote scores. It performs no health request and retries no
failed measured request.

## Transactional PostgreSQL loading

Apply the Django migration first, then seed an already generated dataset:

```sh
uv run zellit-data seed \
  --database-url "$DATABASE_URL" \
  --data-dir data/generated \
  --manifest data/manifest.json \
  --if-needed
```

The loader verifies every artifact before opening its destructive transaction,
serializes seeders with a PostgreSQL advisory lock, truncates only explicit
Zellit tables, uses `COPY` with explicit columns, checks counts and representative
relationships, and writes singleton readiness metadata last. Any error rolls
back the complete replacement. `--if-needed` performs no writes when metadata
and counts already match; use `--force` only for an intentional full reload.

## Regeneration rules

Normal fresh checkouts regenerate ignored CSVs and must match the committed
manifest exactly. Do not commit `data/generated/`.

A deliberate dataset-contract change must update and review together:

1. `data/spec.json` and, when applicable, `data/zip_codes.csv`;
2. generator/loader code and tests;
3. `data/manifest.json` and its overall digest;
4. `data/dataset.env`;
5. `data/benchmark_requests.csv` and its checksum; and
6. every framework readiness/metadata contract that consumes those values.

Always regenerate with `uv sync --frozen`, run the full tests, run canonical
verification, and inspect the manifest diff. Changing one generated checksum in
isolation is not an accepted regeneration.

## Artillery harness

The benchmark workspace is under `benchmark/`. From the repository root:

```sh
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use
export PATH="$NVM_BIN:$PATH"
test "$(node --version)" = v22.23.2
cd research/demo/shared/zellit/benchmark
corepack pnpm install --frozen-lockfile
corepack pnpm test
```

Node 22.23.2, pnpm 11.21.0, and Artillery 2.0.33 are pinned. Available profiles
are `smoke`, `baseline`, `staircase`, `sustained`, and opt-in `overload`.
Arrival rates are requests per second, not connection counts. Environment
variables documented by `profiles.json`/the renderer can override phases
without editing committed profiles.

Run against the Django Compose stack and normalized runtime:

```sh
RUN_ID=zellit-gevent-smoke CLEANUP=0 \
  ./scripts/run-compose.sh smoke gevent-1
RUN_ID=zellit-sync-smoke CLEANUP=1 \
  ./scripts/run-compose.sh smoke sync-1
ENABLE_OVERLOAD=1 RUN_ID=zellit-overload CLEANUP=1 \
  ./scripts/run-compose.sh overload gevent-1
```

Run the isolated one-worker FastAPI stack with the same profiles, request
corpus, processor, and result format:

```sh
RUN_ID=fastapi-zellit-smoke CLEANUP=1 \
  ./scripts/run-fastapi-compose.sh smoke
ENABLE_OVERLOAD=1 RUN_ID=fastapi-zellit-overload CLEANUP=1 \
  ./scripts/run-fastapi-compose.sh overload
```

The FastAPI runner records its fixed `uvicorn-1` runtime, async SQLAlchemy and
asyncpg versions, pool size 20, and zero overflow. It targets only the internal
`http://api:8000` origin and publishes host port 8001 by default so a Django
stack can remain running.

For a host target, use `./scripts/run.sh <profile> <target-url>`, supply complete
explicit `RUN_METADATA_JSON`, and supply either `RUNTIME_JSON_PATH` or
`RUNTIME_JSON_VALUE`. These requirements prevent metadata from silently
describing a different local stack.

Every run creates `benchmark/results/<run-id>/config.json`, `raw.json`,
`metadata.json`, and normally `runtime.json`. Results are ignored by default,
run IDs are never overwritten, and metadata is finalized on success, failure,
or interruption. Smoke output establishes correctness only and must not be used
for a throughput or latency claim.
