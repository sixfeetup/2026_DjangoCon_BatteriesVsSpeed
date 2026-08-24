#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <smoke|baseline|staircase|sustained|overload>" >&2
  exit 2
}

PROFILE="${1:-}"
case "$PROFILE" in
  smoke|baseline|staircase|sustained|overload) ;;
  *) usage ;;
esac
if [ "$PROFILE" = overload ] && [ "${ENABLE_OVERLOAD:-0}" != 1 ]; then
  echo "Refusing overload run unless ENABLE_OVERLOAD=1" >&2
  exit 2
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
BENCHMARK_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
REPO_ROOT="$(cd -- "$BENCHMARK_DIR/../../../../.." && pwd -P)"
COMPOSE_DIR="$REPO_ROOT/research/demo/fastapi/zellit"
DATA_DIR="$REPO_ROOT/research/demo/shared/zellit/data"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fastapi-zellit-runtime.XXXXXX")"
RUNTIME_JSON="$TEMP_DIR/runtime.json"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${PROFILE}-uvicorn-1}"
export API_PORT="${API_PORT:-8001}"

compose() { (cd "$COMPOSE_DIR" && docker compose "$@"); }
finish() {
  local status="$?"
  trap - EXIT
  if [ "${CLEANUP:-0}" = 1 ]; then compose down -v --remove-orphans || true; fi
  rm -rf -- "$TEMP_DIR"
  exit "$status"
}
trap finish EXIT

node "$SCRIPT_DIR/render-fastapi-runtime.mjs" "$RUNTIME_JSON"
API_REPLICAS="${API_REPLICAS:-1}"
if ! [[ "$API_REPLICAS" =~ ^[1-9][0-9]*$ ]]; then
  echo "API_REPLICAS must be a positive integer" >&2
  exit 2
fi
node -e '
  const fs = require("node:fs")
  const [file, replicas] = process.argv.slice(1)
  const runtime = JSON.parse(fs.readFileSync(file, "utf8"))
  runtime.replicas = Number(replicas)
  runtime.pool_size_per_replica = runtime.pool_size
  runtime.aggregate_pool_capacity = runtime.pool_size * runtime.replicas
  fs.writeFileSync(file, `${JSON.stringify(runtime, null, 2)}\n`)
' "$RUNTIME_JSON" "$API_REPLICAS"
export RUNTIME_JSON_VALUE="$(cat "$RUNTIME_JSON")"
export RUN_ID PROFILE ENABLE_OVERLOAD API_REPLICAS
export EXECUTION_MODE=compose
export REQUEST_CORPUS_PATH=/data/benchmark_requests.csv

compose up --build --wait api

package_version() {
  compose exec -T api /app/.venv/bin/python -c \
    'import importlib.metadata,sys; print(importlib.metadata.version(sys.argv[1]))' "$1"
}
PYTHON_VERSION="$(compose exec -T api /app/.venv/bin/python --version 2>&1)"
FASTAPI_VERSION="$(package_version fastapi)"
SQLALCHEMY_VERSION="$(package_version SQLAlchemy)"
ASYNCPG_VERSION="$(package_version asyncpg)"
UVICORN_VERSION="$(package_version uvicorn)"
POSTGRES_VERSION="$(compose exec -T db postgres --version)"
FASTAPI_IMAGE="$(compose images -q api)"
DATA_IMAGE="$(compose images -q dataset)"
POSTGRES_IMAGE="$(compose images -q db)"
compose --profile benchmark build artillery
ARTILLERY_IMAGE="$(docker image inspect zellit-artillery:local --format '{{.Id}}')"
GIT_REVISION="$(git -C "$REPO_ROOT" rev-parse HEAD)"
CORPUS_SHA256="$(shasum -a 256 "$DATA_DIR/benchmark_requests.csv" | awk '{print $1}')"

export PYTHON_VERSION FASTAPI_VERSION SQLALCHEMY_VERSION ASYNCPG_VERSION UVICORN_VERSION POSTGRES_VERSION
export FASTAPI_IMAGE DATA_IMAGE POSTGRES_IMAGE ARTILLERY_IMAGE GIT_REVISION CORPUS_SHA256
export RUN_METADATA_JSON="$(node <<'NODE'
const e = process.env
process.stdout.write(JSON.stringify({
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
}))
NODE
)"

TARGET_URL="${TARGET_URL:-http://api:8000}"
compose --profile benchmark run --rm artillery "$PROFILE" "$TARGET_URL"
