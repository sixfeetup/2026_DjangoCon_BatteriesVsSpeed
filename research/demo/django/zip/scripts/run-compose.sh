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
COMPOSE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
REPO_ROOT="$(cd -- "$COMPOSE_DIR/../../../.." && pwd -P)"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/zip-runtime.XXXXXX")"
RUNTIME_ENV="$TEMP_DIR/runtime.env"
RUNTIME_JSON="$TEMP_DIR/runtime.json"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${PROFILE}-${RUNTIME_MODE}-django}"

compose() {
  (cd "$COMPOSE_DIR" && docker compose --env-file "$RUNTIME_ENV" "$@")
}

finish() {
  local status="$?"
  trap - EXIT
  if [ "${CLEANUP:-0}" = 1 ]; then
    compose down -v --remove-orphans || true
  fi
  rm -rf -- "$TEMP_DIR"
  exit "$status"
}
trap finish EXIT

# Reject invalid or incomplete custom runtimes before touching the stack.
python3 "$SCRIPT_DIR/render_runtime.py" "$RUNTIME_MODE" \
  --env-file "$RUNTIME_ENV" --json-file "$RUNTIME_JSON"
export RUN_ID PROFILE ENABLE_OVERLOAD
export EXECUTION_MODE=docker
export PREFIX_CORPUS_PATH=/data/benchmark_prefixes.csv

compose up --build --wait api

package_version() {
  compose exec -T api python -c \
    'import importlib.metadata,sys; print(importlib.metadata.version(sys.argv[1]))' "$1"
}
export GIT_REVISION="$(git -C "$REPO_ROOT" rev-parse HEAD)"
export TARGET_IMPLEMENTATION=django-zip
export PYTHON_VERSION="$(compose exec -T api python --version 2>&1)"
export APPLICATION_VERSION="$(compose exec -T api python -c 'import tomllib; print(tomllib.load(open("pyproject.toml", "rb"))["project"]["version"])')"
export FRAMEWORK_VERSION="$(package_version Django)"
export SERVER_VERSION="$(package_version gunicorn)"
export REDIS_VERSION="$(compose exec -T redis redis-server --version 2>&1)"
export NINJA_VERSION="$(package_version django-ninja)"
export GEVENT_VERSION="$(package_version gevent)"

compose --profile benchmark build artillery
export DJANGO_IMAGE="$(compose images -q api)"
export DATA_IMAGE="$(compose images -q seed)"
export ARTILLERY_IMAGE="$(docker image inspect zip-artillery:local --format '{{.Id}}')"
export REDIS_IMAGE="$(compose images -q redis)"

python3 - "$RUNTIME_JSON" <<'PY'
import json
import os
import sys
from pathlib import Path

path = Path(sys.argv[1])
runtime = json.loads(path.read_text())
runtime["benchmark_context"] = {
    "alphakit_revision": "e27b2a070c3d8fde298373f0c2f5de04083bd5ba",
    "git_revision": os.environ["GIT_REVISION"],
    "versions": {
        "python": os.environ["PYTHON_VERSION"],
        "django": os.environ["FRAMEWORK_VERSION"],
        "django_ninja": os.environ["NINJA_VERSION"],
        "gunicorn": os.environ["SERVER_VERSION"],
        "gevent": os.environ["GEVENT_VERSION"],
        "redis": os.environ["REDIS_VERSION"],
    },
    "images": {
        "django": os.environ["DJANGO_IMAGE"],
        "data": os.environ["DATA_IMAGE"],
        "artillery": os.environ["ARTILLERY_IMAGE"],
        "redis": os.environ["REDIS_IMAGE"],
    },
}
path.write_text(json.dumps(runtime, indent=2, sort_keys=True) + "\n")
PY
export RUNTIME_JSON_VALUE="$(cat "$RUNTIME_JSON")"

# The measured target is fixed to the internal API origin.
compose --profile benchmark run --rm artillery "$PROFILE" http://api:8000
