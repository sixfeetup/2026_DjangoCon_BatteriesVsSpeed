#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: bash scripts/run-compose.sh <smoke|baseline|staircase|sustained|overload>" >&2
  exit 1
}

trim() {
  printf '%s' "$1" | tr -d '\r'
}

compose() {
  (
    cd "$COMPOSE_DIR"
    docker compose "$@"
  )
}

cleanup() {
  compose down -v --remove-orphans
}

if [ "${1:-}" = "--" ]; then
  shift
fi

PROFILE="${1:-}"
if [ -z "$PROFILE" ]; then
  usage
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
BENCHMARK_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
REPO_ROOT="$(cd -- "$BENCHMARK_DIR/../../../../.." && pwd -P)"
COMPOSE_DIR="$(cd -- "$REPO_ROOT/research/demo/fastapi/zip" && pwd -P)"
TARGET_URL="${TARGET_URL:-http://api:8000}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${PROFILE}}"

if [ "${CLEANUP:-0}" = "1" ]; then
  trap cleanup EXIT
fi

export RUN_ID
export GIT_REVISION="$(git -C "$REPO_ROOT" rev-parse HEAD)"
export EXECUTION_MODE=docker

compose up --build --wait api

export PYTHON_VERSION="$(trim "$(compose exec -T api python --version 2>&1)")"
export APPLICATION_VERSION="$(trim "$(compose exec -T api uv run --frozen python -c 'import importlib.metadata; print(importlib.metadata.version("zip-api"))' 2>&1)")"
export FRAMEWORK_VERSION="$(trim "$(compose exec -T api uv run --frozen python -c 'import importlib.metadata; print(importlib.metadata.version("fastapi"))' 2>&1)")"
export SERVER_VERSION="$(trim "$(compose exec -T api uv run --frozen python -c 'import importlib.metadata; print(importlib.metadata.version("uvicorn"))' 2>&1)")"
export REDIS_VERSION="$(trim "$(compose exec -T redis redis-server --version 2>&1)")"

compose --profile benchmark build artillery
compose --profile benchmark run --rm artillery "$PROFILE" "$TARGET_URL"
