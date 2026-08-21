#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <smoke|baseline|staircase|sustained|overload> <target-url>" >&2
  exit 2
}

validate_run_id() {
  if [[ ! "$1" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)*$ ]]; then
    echo "Invalid RUN_ID: use safe ASCII letters, digits, underscores, hyphens, and separated dots" >&2
    exit 2
  fi
}

now() { node -e 'process.stdout.write(new Date().toISOString())'; }

PROFILE="${1:-}"
TARGET="${2:-}"
[ -n "$PROFILE" ] && [ -n "$TARGET" ] || usage
if [ "$PROFILE" = overload ] && [ "${ENABLE_OVERLOAD:-0}" != 1 ]; then
  echo "Refusing overload run unless ENABLE_OVERLOAD=1" >&2
  exit 2
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
BENCHMARK_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
RESULTS_DIR="${RESULTS_DIR:-$BENCHMARK_DIR/results}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$PROFILE}"
validate_run_id "$RUN_ID"
RESULT_DIR="$RESULTS_DIR/$RUN_ID"
CONFIG_PATH="$RESULT_DIR/config.json"
RAW_PATH="$RESULT_DIR/raw.json"
METADATA_PATH="$RESULT_DIR/metadata.json"
RUNTIME_PATH="$RESULT_DIR/runtime.json"
STARTED_AT="$(now)"
FINALIZED=0
FINAL_STATUS_OVERRIDE=""
ARTILLERY_PID=""
EFFECTIVE_PHASES='[]'
NODE_VERSION="$(node --version)"
PNPM_VERSION="unknown"
ARTILLERY_VERSION="unknown"

if ! mkdir -- "$RESULT_DIR"; then
  echo "Benchmark run directory already exists: $RESULT_DIR" >&2
  exit 2
fi

write_metadata() {
  local status="$1" exit_status="$2" completed_at="$3"
  RUN_METADATA_JSON_VALUE="${RUN_METADATA_JSON:-}" \
  RUN_ID_VALUE="$RUN_ID" STARTED_AT_VALUE="$STARTED_AT" COMPLETED_AT_VALUE="$completed_at" \
  STATUS_VALUE="$status" EXIT_STATUS_VALUE="$exit_status" PROFILE_VALUE="$PROFILE" TARGET_VALUE="$TARGET" \
  EXECUTION_MODE_VALUE="${EXECUTION_MODE:-host}" EFFECTIVE_PHASES_VALUE="$EFFECTIVE_PHASES" \
  NODE_VERSION_VALUE="$NODE_VERSION" PNPM_VERSION_VALUE="$PNPM_VERSION" ARTILLERY_VERSION_VALUE="$ARTILLERY_VERSION" \
  node <<'NODE' | node "$SCRIPT_DIR/write-metadata.mjs" "$METADATA_PATH"
const supplied = JSON.parse(process.env.RUN_METADATA_JSON_VALUE || '{}')
const versions = {...(supplied.versions || {}), node: process.env.NODE_VERSION_VALUE, pnpm: process.env.PNPM_VERSION_VALUE, artillery: process.env.ARTILLERY_VERSION_VALUE}
const metadata = {
  ...supplied,
  run_id: process.env.RUN_ID_VALUE,
  started_at: process.env.STARTED_AT_VALUE,
  completed_at: process.env.COMPLETED_AT_VALUE || null,
  status: process.env.STATUS_VALUE,
  exit_status: process.env.EXIT_STATUS_VALUE === '' ? null : Number(process.env.EXIT_STATUS_VALUE),
  profile: process.env.PROFILE_VALUE,
  target: process.env.TARGET_VALUE,
  execution_mode: process.env.EXECUTION_MODE_VALUE,
  git_revision: supplied.git_revision || 'unrecorded',
  alphakit_revision: supplied.alphakit_revision || 'unrecorded',
  implementation: supplied.implementation || 'unrecorded',
  dataset: supplied.dataset || {},
  request_corpus: supplied.request_corpus || {},
  effective_phases: JSON.parse(process.env.EFFECTIVE_PHASES_VALUE),
  versions,
  images: supplied.images || {},
  resource_limits: supplied.resource_limits ?? null,
  notes: supplied.notes ?? ''
}
process.stdout.write(JSON.stringify(metadata))
NODE
}

finalize() {
  local exit_status="$1"
  [ "$FINALIZED" -eq 0 ] || return 0
  FINALIZED=1
  local status=failed
  [ "$exit_status" -eq 0 ] && status=succeeded
  [ -n "$FINAL_STATUS_OVERRIDE" ] && status="$FINAL_STATUS_OVERRIDE"
  write_metadata "$status" "$exit_status" "$(now)" || true
}

on_exit() {
  local status="$?"
  trap - EXIT HUP INT TERM
  finalize "$status"
  exit "$status"
}

on_signal() {
  local signal="$1" status="$2"
  FINAL_STATUS_OVERRIDE=interrupted
  if [ -n "$ARTILLERY_PID" ]; then
    kill -s "$signal" "$ARTILLERY_PID" 2>/dev/null || true
    wait "$ARTILLERY_PID" 2>/dev/null || true
    ARTILLERY_PID=""
  fi
  exit "$status"
}

# Arm finalization and create the initial record before rendering, discovery, or load generation.
trap on_exit EXIT
trap 'on_signal HUP 129' HUP
trap 'on_signal INT 130' INT
trap 'on_signal TERM 143' TERM
write_metadata running "" ""

node "$SCRIPT_DIR/render-config.mjs" "$PROFILE" "$TARGET" "$CONFIG_PATH"
EFFECTIVE_PHASES="$(node -e "const c=require(process.argv[1]);process.stdout.write(JSON.stringify(c.config.phases))" "$CONFIG_PATH")"

# Arbitrary host targets must be described explicitly; never borrow local Compose identity.
if [ "${EXECUTION_MODE:-host}" = host ]; then
  if [ -z "${RUNTIME_JSON_VALUE:-}" ] && [ -z "${RUNTIME_JSON_PATH:-}" ]; then
    echo "Host runs require RUNTIME_JSON_VALUE or RUNTIME_JSON_PATH" >&2
    exit 2
  fi
  RUN_METADATA_JSON_VALUE="${RUN_METADATA_JSON:-}" node <<'NODE'
const raw = process.env.RUN_METADATA_JSON_VALUE
if (!raw) throw new Error('Host runs require explicit RUN_METADATA_JSON')
const value = JSON.parse(raw)
for (const field of ['git_revision', 'alphakit_revision', 'implementation']) {
  if (typeof value[field] !== 'string' || !value[field]) throw new Error(`Host metadata is missing ${field}`)
}
for (const field of ['dataset', 'request_corpus', 'versions', 'images']) {
  if (!value[field] || typeof value[field] !== 'object' || Array.isArray(value[field]) || Object.keys(value[field]).length === 0) {
    throw new Error(`Host metadata is missing ${field}`)
  }
}
NODE
fi

if [ -n "${RUNTIME_JSON_VALUE:-}" ]; then
  printf '%s\n' "$RUNTIME_JSON_VALUE" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s),null,2)+"\n"))' > "$RUNTIME_PATH"
elif [ -n "${RUNTIME_JSON_PATH:-}" ]; then
  cp -- "$RUNTIME_JSON_PATH" "$RUNTIME_PATH"
fi

PNPM_VERSION="$(corepack pnpm --version)"
ARTILLERY_VERSION="$(corepack pnpm exec artillery --version | awk -F': +' '/^Artillery:/ {print $2; exit}')"
[ -n "$ARTILLERY_VERSION" ] || { echo "Could not discover Artillery version" >&2; exit 1; }
write_metadata running "" ""

set +e
corepack pnpm exec artillery run --output "$RAW_PATH" "$CONFIG_PATH" &
ARTILLERY_PID=$!
wait "$ARTILLERY_PID"
ARTILLERY_STATUS=$?
ARTILLERY_PID=""
set -e

echo "$RESULT_DIR"
exit "$ARTILLERY_STATUS"
