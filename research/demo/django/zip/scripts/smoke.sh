#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/zip-smoke.XXXXXX")
RUNTIME_ENV="$TEMP_DIR/runtime.env"
RUNTIME_JSON="$TEMP_DIR/runtime.json"
FIRST_RESPONSE="$TEMP_DIR/gevent.json"
SECOND_RESPONSE="$TEMP_DIR/sync.json"
API_PORT_VALUE="${API_PORT:-8000}"

compose() { docker compose --env-file "$RUNTIME_ENV" "$@"; }
cleanup() {
  status=$?
  trap - EXIT INT TERM
  if [ "${CLEANUP:-1}" = 1 ]; then
    compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$TEMP_DIR"
  exit "$status"
}
trap cleanup EXIT INT TERM

render() {
  python3 scripts/render_runtime.py "$1" \
    --env-file "$RUNTIME_ENV" --json-file "$RUNTIME_JSON"
}
wait_ready() {
  attempts=0
  until curl --fail --silent "http://127.0.0.1:${API_PORT_VALUE}/health" >/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 60 ]; then
      compose logs api
      return 1
    fi
    sleep 1
  done
}
validate() {
  target=$1
  curl --fail --silent --show-error \
    "http://127.0.0.1:${API_PORT_VALUE}/zip-codes?q=462" \
    --output "$target"
  python3 - "$target" <<'PY'
import json
import sys
records = json.load(open(sys.argv[1]))
assert len(records) == 10, records
assert records == sorted(records, key=lambda record: record["zip"]), records
by_zip = {record["zip"]: record["city"] for record in records}
assert by_zip["46201"] == "Indianapolis", records
assert by_zip["46202"] == "Indianapolis", records
PY
}

compose down --volumes --remove-orphans >/dev/null 2>&1 || true
render gevent-1
compose build api seed
compose up -d --wait api
validate "$FIRST_RESPONSE"
FIRST_DIGEST=$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$FIRST_RESPONSE")

render sync-1
compose up -d --no-deps --force-recreate api
wait_ready
validate "$SECOND_RESPONSE"
SECOND_DIGEST=$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$SECOND_RESPONSE")

if [ "$FIRST_DIGEST" != "$SECOND_DIGEST" ]; then
  echo "runtime responses differ: $FIRST_DIGEST != $SECOND_DIGEST" >&2
  exit 1
fi
printf 'gevent-1 and sync-1 response sha256: %s\n' "$FIRST_DIGEST"
