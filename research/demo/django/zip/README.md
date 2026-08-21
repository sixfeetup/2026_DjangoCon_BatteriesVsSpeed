# Django ZIP benchmark demo

This is the Django/AlphaKit work-alike implementation of the FastAPI ZIP demo. It serves the same Redis dataset and public contracts:

- `GET /zip-codes?q=<1-5 ASCII digits>` returns at most ten `{zip, city}` records in lexical ZIP order.
- `GET /health` returns `{"status":"ready"}` only when Redis, dataset cardinality, and dataset metadata match.
- Redis failures return the same stable `503` response bodies as the FastAPI implementation.

## Provenance

The skeleton was rendered from the clean local AlphaKit source at `~/src/alphakit`, revision `e27b2a070c3d8fde298373f0c2f5de04083bd5ba`:

```bash
copier copy \
  --vcs-ref=e27b2a070c3d8fde298373f0c2f5de04083bd5ba \
  --data project_name=zip \
  ~/src/alphakit \
  research/demo/django/zip
```

The measured Compose API uses CPython 3.14.4. Committed `sync-1` and `gevent-1` presets make the one-worker Gunicorn runtime explicit; custom runtimes must be labeled and normalized before startup.

## Test

From this directory:

```bash
uv sync --frozen
docker compose up -d --wait redis
SECRET_KEY=test \
DATABASE_URL=sqlite://:memory: \
ZIP_DATASET_SHA256=test \
TEST_REDIS_URL=redis://localhost:6379/15 \
uv run pytest -q
docker compose down -v --remove-orphans
```

## Run and smoke test

```bash
docker compose up --build --wait api
curl 'http://localhost:8000/zip-codes?q=462'
curl 'http://localhost:8000/health'
docker compose down -v --remove-orphans
```

Or run the two-runtime acceptance smoke. It starts `gevent-1`, validates the response, switches the same image and dataset to `sync-1`, and requires byte-identical responses:

```bash
API_PORT=8000 CLEANUP=1 ./scripts/smoke.sh
```

## Runtime selection

`runtime-presets.json` is the source of truth. The renderer writes the exact Compose environment and normalized JSON metadata:

```bash
python3 scripts/render_runtime.py gevent-1 \
  --env-file .runtime.env --json-file runtime.json
docker compose --env-file .runtime.env up --build --wait api

python3 scripts/render_runtime.py sync-1 \
  --env-file .runtime.env --json-file runtime.json
docker compose --env-file .runtime.env up -d --no-deps --force-recreate api
```

A custom runtime requires a safe label and explicit worker class. Other documented Gunicorn values are optional overrides:

```bash
RUNTIME_LABEL=sync-4 \
GUNICORN_WORKER_CLASS=sync \
GUNICORN_WORKERS=4 \
python3 scripts/render_runtime.py custom \
  --env-file .runtime.env --json-file runtime.json
```

## Benchmarks

The service uses the shared ZIP Artillery profiles and request corpus. Every Compose run requires a runtime preset, fixes the measured target to `http://api:8000`, discovers versions and image IDs from running containers, and stores the normalized runtime alongside the standard artifacts. Smoke is for correctness and wiring only, not performance evidence.

```bash
RUN_ID=django-zip-gevent-smoke CLEANUP=0 \
  ./scripts/run-compose.sh smoke gevent-1
RUN_ID=django-zip-sync-smoke CLEANUP=0 \
  ./scripts/run-compose.sh smoke sync-1
RUN_ID=django-zip-gevent-staircase CLEANUP=0 \
  ./scripts/run-compose.sh staircase gevent-1
RUN_ID=django-zip-sync-sustained CLEANUP=1 \
  ./scripts/run-compose.sh sustained sync-1
```

Overload remains opt-in:

```bash
ENABLE_OVERLOAD=1 CLEANUP=1 \
  ./scripts/run-compose.sh overload gevent-1
```

Each unique run under `research/demo/shared/zip/benchmark/results/` contains `config.json`, `raw.json`, `metadata.json`, and `runtime.json`. The runtime artifact includes the AlphaKit revision, effective Gunicorn settings, component versions, and image IDs. Existing run directories are never replaced.

For comparison runs, use the same profile, dataset, corpus, and runtime shape, and alternate implementations to reduce drift. Run at least three measurements per side; do not publish claims from smoke output.
