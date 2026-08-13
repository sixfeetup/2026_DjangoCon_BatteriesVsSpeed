#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: bash scripts/run.sh <smoke|baseline|staircase|sustained|overload> <target-url>" >&2
  exit 1
}

trim() {
  printf '%s' "$1" | tr -d '\r'
}

compose_file() {
  cd -- "$BENCHMARK_DIR" && realpath ../../../fastapi/zip/compose.yaml
}

validate_run_id() {
  local value="$1"
  if [[ ! "$value" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)*$ ]]; then
    echo "Invalid RUN_ID: use only ASCII letters, digits, underscores, hyphens, and separated dots" >&2
    exit 1
  fi
}

require_value() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "Missing required metadata value: $name" >&2
    exit 1
  fi

  if [[ "$value" == *$'\n'* ]] || [[ "$value" == *$'\r'* ]]; then
    echo "Invalid metadata value for $name: expected a single line" >&2
    exit 1
  fi

  if [[ "$value" == Traceback* ]] || [[ "$value" == *PackageNotFoundError* ]] || [[ "$value" == *"No package metadata was found"* ]]; then
    echo "Invalid metadata value for $name: $value" >&2
    exit 1
  fi
}

iso_utc_now() {
  node -e "process.stdout.write(new Date().toISOString())"
}

write_metadata() {
  local completed_at="$1"
  METADATA_OUTPUT_PATH="$METADATA_PATH" \
  RUN_ID_VALUE="$RUN_ID" \
  STARTED_AT_VALUE="$STARTED_AT" \
  COMPLETED_AT_VALUE="$completed_at" \
  GIT_REVISION_VALUE="$GIT_REVISION" \
  TARGET_IMPLEMENTATION_VALUE="$TARGET_IMPLEMENTATION_VALUE" \
  TARGET_VALUE="$TARGET" \
  PROFILE_VALUE="$PROFILE" \
  NODE_VERSION_VALUE="$NODE_VERSION" \
  ARTILLERY_VERSION_VALUE="$ARTILLERY_VERSION" \
  PYTHON_VERSION_VALUE="$PYTHON_VERSION_VALUE" \
  APPLICATION_VERSION_VALUE="$APPLICATION_VERSION_VALUE" \
  FRAMEWORK_VERSION_VALUE="$FRAMEWORK_VERSION_VALUE" \
  SERVER_VERSION_VALUE="$SERVER_VERSION_VALUE" \
  REDIS_VERSION_VALUE="$REDIS_VERSION_VALUE" \
  EFFECTIVE_PHASES_VALUE="$EFFECTIVE_PHASES" \
  EXECUTION_MODE_VALUE="${EXECUTION_MODE:-host}" \
  node <<'NODE' | node "$SCRIPT_DIR/write-metadata.mjs" "$METADATA_PATH"
const metadata = {
  run_id: process.env.RUN_ID_VALUE,
  started_at: process.env.STARTED_AT_VALUE,
  completed_at: process.env.COMPLETED_AT_VALUE || null,
  git_revision: process.env.GIT_REVISION_VALUE,
  target_implementation: process.env.TARGET_IMPLEMENTATION_VALUE,
  target: process.env.TARGET_VALUE,
  profile: process.env.PROFILE_VALUE,
  node_version: process.env.NODE_VERSION_VALUE,
  artillery_version: process.env.ARTILLERY_VERSION_VALUE,
  python_version: process.env.PYTHON_VERSION_VALUE,
  application_version: process.env.APPLICATION_VERSION_VALUE,
  framework_version: process.env.FRAMEWORK_VERSION_VALUE,
  server_version: process.env.SERVER_VERSION_VALUE,
  redis_version: process.env.REDIS_VERSION_VALUE,
  effective_phases: JSON.parse(process.env.EFFECTIVE_PHASES_VALUE),
  execution_mode: process.env.EXECUTION_MODE_VALUE
}
process.stdout.write(JSON.stringify(metadata))
NODE
}

signal_to_status() {
  case "$1" in
    HUP) echo 129 ;;
    INT) echo 130 ;;
    TERM) echo 143 ;;
    *) echo 1 ;;
  esac
}

FINALIZED=0
METADATA_READY=0
ARTILLERY_PID=""

finalize_with_status() {
  local status="$1"
  trap - EXIT HUP INT TERM

  if [ "$FINALIZED" -eq 0 ] && [ "$METADATA_READY" -eq 1 ]; then
    FINALIZED=1
    write_metadata "$(iso_utc_now)"
  fi

  exit "$status"
}

handle_exit() {
  finalize_with_status "$1"
}

handle_signal() {
  local signal="$1"
  local status
  local artillery_status
  status="$(signal_to_status "$signal")"

  if [ -n "$ARTILLERY_PID" ]; then
    kill -s "$signal" "$ARTILLERY_PID" 2>/dev/null || true
    set +e
    wait "$ARTILLERY_PID"
    artillery_status=$?
    set -e
    ARTILLERY_PID=""
    if [ "$artillery_status" -ne 0 ] && [ "$artillery_status" -ne 127 ]; then
      status="$artillery_status"
    fi
  fi

  finalize_with_status "$status"
}

if [ "${1:-}" = "--" ]; then
  shift
fi

PROFILE="${1:-}"
TARGET="${2:-}"
if [ -z "$PROFILE" ] || [ -z "$TARGET" ]; then
  usage
fi

if [ "$PROFILE" = "overload" ] && [ "${ENABLE_OVERLOAD:-0}" != "1" ]; then
  echo "Refusing overload run unless ENABLE_OVERLOAD=1" >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
BENCHMARK_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
RESULTS_DIR="$BENCHMARK_DIR/results"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_ID="${RUN_ID:-${TIMESTAMP}-${PROFILE}}"
validate_run_id "$RUN_ID"
RESULT_DIR="$RESULTS_DIR/$RUN_ID"
CONFIG_PATH="$RESULT_DIR/config.json"
RAW_PATH="$RESULT_DIR/raw.json"
METADATA_PATH="$RESULT_DIR/metadata.json"
if ! mkdir -- "$RESULT_DIR"; then
  echo "Benchmark run directory already exists: $RESULT_DIR" >&2
  exit 1
fi

trap 'handle_exit "$?"' EXIT
trap 'handle_signal HUP' HUP
trap 'handle_signal INT' INT
trap 'handle_signal TERM' TERM

node "$SCRIPT_DIR/render-config.mjs" "$PROFILE" "$TARGET" "$CONFIG_PATH"

STARTED_AT="$(iso_utc_now)"
EFFECTIVE_PHASES="$(node -e "const fs = require('node:fs'); const config = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(JSON.stringify(config.config.phases));" "$CONFIG_PATH")"
NODE_VERSION="$(trim "$(node --version)")"
METADATA_SOURCE_VALUE="${METADATA_SOURCE:-explicit}"

case "$METADATA_SOURCE_VALUE" in
  explicit)
    GIT_REVISION="$(trim "${GIT_REVISION:-}")"
    TARGET_IMPLEMENTATION_VALUE="$(trim "${TARGET_IMPLEMENTATION:-}")"
    PYTHON_VERSION_VALUE="$(trim "${PYTHON_VERSION:-}")"
    APPLICATION_VERSION_VALUE="$(trim "${APPLICATION_VERSION:-${ZIP_API_VERSION:-}}")"
    FRAMEWORK_VERSION_VALUE="$(trim "${FRAMEWORK_VERSION:-${FASTAPI_VERSION:-}}")"
    SERVER_VERSION_VALUE="$(trim "${SERVER_VERSION:-${UVICORN_VERSION:-}}")"
    REDIS_VERSION_VALUE="$(trim "${REDIS_VERSION:-}")"
    ;;
  local-compose)
    LOCAL_COMPOSE_TARGET="http://localhost:${API_PORT:-8000}"
    if [ "$TARGET" != "$LOCAL_COMPOSE_TARGET" ]; then
      echo "METADATA_SOURCE=local-compose only supports $LOCAL_COMPOSE_TARGET" >&2
      exit 1
    fi
    GIT_REVISION="$(trim "$(git -C "$BENCHMARK_DIR" rev-parse HEAD)")"
    TARGET_IMPLEMENTATION_VALUE="fastapi-zip"
    PYTHON_VERSION_VALUE="$(trim "$(docker compose -f "$(compose_file)" exec -T api python --version 2>&1)")"
    APPLICATION_VERSION_VALUE="$(trim "$(docker compose -f "$(compose_file)" exec -T api uv run --frozen python -c 'import importlib.metadata; print(importlib.metadata.version("zip-api"))' 2>&1)")"
    FRAMEWORK_VERSION_VALUE="$(trim "$(docker compose -f "$(compose_file)" exec -T api uv run --frozen python -c 'import importlib.metadata; print(importlib.metadata.version("fastapi"))' 2>&1)")"
    SERVER_VERSION_VALUE="$(trim "$(docker compose -f "$(compose_file)" exec -T api uv run --frozen python -c 'import importlib.metadata; print(importlib.metadata.version("uvicorn"))' 2>&1)")"
    REDIS_VERSION_VALUE="$(trim "$(docker compose -f "$(compose_file)" exec -T redis redis-server --version 2>&1)")"
    ;;
  *)
    echo "Invalid METADATA_SOURCE: expected explicit or local-compose" >&2
    exit 1
    ;;
esac

require_value "TARGET_IMPLEMENTATION" "$TARGET_IMPLEMENTATION_VALUE"
require_value "GIT_REVISION" "$GIT_REVISION"
require_value "node_version" "$NODE_VERSION"
require_value "PYTHON_VERSION" "$PYTHON_VERSION_VALUE"
require_value "APPLICATION_VERSION" "$APPLICATION_VERSION_VALUE"
require_value "FRAMEWORK_VERSION" "$FRAMEWORK_VERSION_VALUE"
require_value "SERVER_VERSION" "$SERVER_VERSION_VALUE"
require_value "REDIS_VERSION" "$REDIS_VERSION_VALUE"

ARTILLERY_VERSION="$(corepack pnpm exec artillery --version | awk -F': +' '/^Artillery:/ {print $2}')"
ARTILLERY_VERSION="$(trim "$ARTILLERY_VERSION")"
require_value "artillery_version" "$ARTILLERY_VERSION"

METADATA_READY=1
write_metadata ""

set +e
corepack pnpm exec artillery run --output "$RAW_PATH" "$CONFIG_PATH" &
ARTILLERY_PID=$!
wait "$ARTILLERY_PID"
ARTILLERY_STATUS=$?
ARTILLERY_PID=""
set -e

write_metadata "$(iso_utc_now)"
FINALIZED=1

echo "$RESULT_DIR"
exit "$ARTILLERY_STATUS"
