#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <smoke|baseline|staircase|sustained|overload> <gevent-1|sync-1|custom>" >&2
  exit 2
}

PROFILE="${1:-}"
RUNTIME_MODE="${2:-}"
[ -n "$PROFILE" ] && [ -n "$RUNTIME_MODE" ] || usage
if [ "$PROFILE" = overload ] && [ "${ENABLE_OVERLOAD:-0}" != 1 ]; then
  echo "Refusing overload run unless ENABLE_OVERLOAD=1" >&2
  exit 2
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
BENCHMARK_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
REPO_ROOT="$(cd -- "$BENCHMARK_DIR/../../../../.." && pwd -P)"
COMPOSE_DIR="$REPO_ROOT/research/demo/django/zellit"
DATA_DIR="$REPO_ROOT/research/demo/shared/zellit/data"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/zellit-runtime.XXXXXX")"
RUNTIME_ENV="$TEMP_DIR/runtime.env"
RUNTIME_JSON="$TEMP_DIR/runtime.json"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${PROFILE}-${RUNTIME_MODE}}"

compose() { (cd "$COMPOSE_DIR" && docker compose --env-file "$RUNTIME_ENV" "$@"); }
finish() {
  local status="$?"
  trap - EXIT
  if [ "${CLEANUP:-0}" = 1 ]; then compose down -v --remove-orphans || true; fi
  rm -rf -- "$TEMP_DIR"
  exit "$status"
}
trap finish EXIT

# Normalize and reject invalid/custom-incomplete runtime input before touching the stack.
node "$SCRIPT_DIR/render-runtime.mjs" "$RUNTIME_MODE" "$RUNTIME_ENV" "$RUNTIME_JSON"
export RUNTIME_JSON_VALUE="$(cat "$RUNTIME_JSON")"
export RUN_ID PROFILE ENABLE_OVERLOAD
export EXECUTION_MODE=compose
export REQUEST_CORPUS_PATH=/data/benchmark_requests.csv

compose up --build --wait api

package_version() {
  compose exec -T api python -c 'import importlib.metadata,sys; print(importlib.metadata.version(sys.argv[1]))' "$1"
}
PYTHON_VERSION="$(compose exec -T api python --version 2>&1)"
DJANGO_VERSION="$(package_version Django)"
NINJA_VERSION="$(package_version django-ninja)"
GUNICORN_VERSION="$(package_version gunicorn)"
GEVENT_VERSION="$(package_version gevent)"
GEVENTPOOL_VERSION="$(package_version django-db-geventpool)"
POSTGRES_VERSION="$(compose exec -T db postgres --version)"
DJANGO_IMAGE="$(compose images -q api)"
DATA_IMAGE="$(compose images -q dataset)"
POSTGRES_IMAGE="$(compose images -q db)"
compose --profile benchmark build artillery
ARTILLERY_IMAGE="$(docker image inspect zellit-artillery:local --format '{{.Id}}')"
GIT_REVISION="$(git -C "$REPO_ROOT" rev-parse HEAD)"
CORPUS_SHA256="$(shasum -a 256 "$DATA_DIR/benchmark_requests.csv" | awk '{print $1}')"

export PYTHON_VERSION DJANGO_VERSION NINJA_VERSION GUNICORN_VERSION GEVENT_VERSION GEVENTPOOL_VERSION POSTGRES_VERSION
export DJANGO_IMAGE DATA_IMAGE POSTGRES_IMAGE ARTILLERY_IMAGE GIT_REVISION CORPUS_SHA256 DATA_DIR
export RUN_METADATA_JSON="$(node <<'NODE'
const e = process.env
process.stdout.write(JSON.stringify({
  git_revision: e.GIT_REVISION,
  alphakit_revision: 'b9ee939e0fc6765320cd22e29d6be244db30062b',
  implementation: 'django-zellit',
  dataset: {
    schema_version: '1', generator_version: '1', seed: 20260813,
    digest: 'd631bfe327777c65a45098f536c9124c822a854480352e5f4564ce62946f3862'
  },
  request_corpus: {sha256: e.CORPUS_SHA256, rows: 500},
  versions: {
    python: e.PYTHON_VERSION, django: e.DJANGO_VERSION, django_ninja: e.NINJA_VERSION,
    gunicorn: e.GUNICORN_VERSION, gevent: e.GEVENT_VERSION,
    django_db_geventpool: e.GEVENTPOOL_VERSION, postgresql: e.POSTGRES_VERSION
  },
  images: {django: e.DJANGO_IMAGE, data: e.DATA_IMAGE, artillery: e.ARTILLERY_IMAGE, postgresql: e.POSTGRES_IMAGE},
  resource_limits: process.env.RESOURCE_LIMITS || null,
  notes: process.env.BENCHMARK_NOTES || ''
}))
NODE
)"

# The service fixes the only measured target to the internal API origin.
compose --profile benchmark run --rm artillery "$PROFILE" http://api:8000
