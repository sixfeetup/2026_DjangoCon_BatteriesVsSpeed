#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
COMPOSE="docker compose"
RUNTIME_ENV=.runtime.env
RUNTIME_JSON=runtime.json
FIRST_RESPONSE=$(mktemp)
SECOND_RESPONSE=$(mktemp)

cleanup() {
  status=$?
  trap - EXIT INT TERM
  rm -f "$FIRST_RESPONSE" "$SECOND_RESPONSE" "$RUNTIME_ENV" "$RUNTIME_JSON"
  if [ "${CLEANUP:-0}" = 1 ]; then
    $COMPOSE down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM

if [ "${CLEAN_START:-0}" = 1 ]; then
  $COMPOSE down --volumes --remove-orphans
fi

render() {
  python3 scripts/render_runtime.py "$1" --env-file "$RUNTIME_ENV" --json-file "$RUNTIME_JSON"
}
wait_ready() {
  attempts=0
  until curl --fail --silent http://127.0.0.1:${API_PORT:-8000}/health >/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 60 ]; then
      $COMPOSE --env-file "$RUNTIME_ENV" logs api
      return 1
    fi
    sleep 2
  done
}
validate() {
  target=$1
  curl --fail --silent \
    "http://127.0.0.1:${API_PORT:-8000}/api/v1/zip-codes/46201/listings?limit=20&offset=0" \
    --output "$target"
  python3 - "$target" <<'PY'
import json, sys
payload = json.load(open(sys.argv[1]))
assert payload["zip_code"]["code"] == "46201"
assert payload["market"]["listing_count"] == 200
assert payload["pagination"] == {"limit": 20, "offset": 0, "returned": 20}
assert len(payload["listings"]) == 20
assert all(len(item["photos"]) == 4 for item in payload["listings"])
assert all(len(item["comments"]) == 3 for item in payload["listings"])
assert all(item["comment_count"] == 3 for item in payload["listings"])
PY
}

render gevent-1
$COMPOSE --env-file "$RUNTIME_ENV" build api dataset
$COMPOSE --env-file "$RUNTIME_ENV" up -d --wait api
validate "$FIRST_RESPONSE"
FIRST_DIGEST=$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$FIRST_RESPONSE")

render sync-1
$COMPOSE --env-file "$RUNTIME_ENV" up -d --no-deps --force-recreate api
wait_ready
validate "$SECOND_RESPONSE"
SECOND_DIGEST=$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$SECOND_RESPONSE")

if [ "$FIRST_DIGEST" != "$SECOND_DIGEST" ]; then
  echo "runtime responses differ: $FIRST_DIGEST != $SECOND_DIGEST" >&2
  exit 1
fi
printf 'gevent-1 and sync-1 response sha256: %s\n' "$FIRST_DIGEST"
