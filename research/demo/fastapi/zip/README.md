# FastAPI ZIP benchmark demo

This demo serves `GET /zip-codes?q=<1-5 digits>` from Redis and exposes `GET /health` for readiness.

## Prerequisites

- Docker and Docker Compose
- `uv`
- `nvm` with Node `22.23.2` from the repo `.nvmrc`
- `corepack`

## Fresh-checkout operator workflow

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

## Benchmark profiles and request-rate semantics

- Profiles: `smoke`, `baseline`, `staircase`, `sustained`, `overload`.
- `arrivalRate` is request arrival rate per second for a phase, not a concurrency setting.
- Defaults come from `research/demo/shared/zip/benchmark/profiles.json`:
  - `smoke`: 10s at 1 req/s
  - `baseline`: 60s at 5 req/s
  - `staircase`: 20s warm-up at 10 req/s, then 45s each at 25, 50, 100, 200, 400, and 800 req/s
  - `sustained`: 300s at 200 req/s
  - `overload`: 30s at 1200 req/s
- Host runs take the target URL as a required argument, so you can point Artillery at another host or port.
- Compose runs default `TARGET_URL` to `http://api:8000`, but you can override it with `TARGET_URL=...`.
- `scripts/smoke.sh` curls `http://localhost:8000`, so it currently assumes the published API port is `8000`.

## Overrides and safety rails

- Simple one-phase overrides are supported with env vars such as `SMOKE_RATE`, `SMOKE_DURATION`, `BASELINE_RATE`, `BASELINE_DURATION`, `SUSTAINED_RATE`, `SUSTAINED_DURATION`, `OVERLOAD_RATE`, and `OVERLOAD_DURATION`.
- `STAIRCASE_RATES` can replace the six measured staircase rates as a comma-separated list while keeping the warm-up phase.
- Overload is opt-in only:

```bash
ENABLE_OVERLOAD=1 corepack pnpm benchmark -- overload http://localhost:8000
ENABLE_OVERLOAD=1 CLEANUP=1 ./scripts/run-compose.sh overload
```

## Results and interpretation

- Each benchmark run writes artifacts under `research/demo/shared/zip/benchmark/results/<run-id>/`.
- Each run directory contains:
  - `config.json`
  - `raw.json`
  - `metadata.json`
- `RUN_ID=...` lets you name a run explicitly in both host and Compose modes.
- `results/` is gitignored; do not commit local benchmark artifacts.
- Smoke runs are for correctness and wiring only. Do not publish throughput or latency claims from smoke output.
- Any benchmark statement from this demo is workload-limited: it describes this ZIP-prefix lookup workload, this dataset, this response contract, and this benchmark harness only.

## Future comparison runs

When comparing FastAPI against another implementation later, run three measurements per side in alternating order to reduce drift, for example:

1. FastAPI run 1
2. other implementation run 1
3. FastAPI run 2
4. other implementation run 2
5. FastAPI run 3
6. other implementation run 3

Use the same profile, target shape, dataset, and override settings for every run in the series.
