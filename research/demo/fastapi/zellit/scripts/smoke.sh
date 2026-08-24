#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export API_PORT="${API_PORT:-8000}"
cleanup() { docker compose down -v --remove-orphans; }
trap cleanup EXIT

docker compose down -v --remove-orphans
docker compose up --build --wait api
response="$(curl --fail --silent --show-error "http://127.0.0.1:${API_PORT}/api/v1/zip-codes/46201/listings?limit=20&offset=0")"
python3 - "$response" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
assert payload["zip_code"]["code"] == "46201"
assert payload["market"]["listing_count"] == 200
assert payload["pagination"] == {"limit": 20, "offset": 0, "returned": 20}
assert len(payload["listings"]) == 20
assert all(len(item["photos"]) == 4 for item in payload["listings"])
assert all(len(item["comments"]) == 3 for item in payload["listings"])
assert all(item["comment_count"] == 3 for item in payload["listings"])
PY
curl --fail --silent --show-error "http://127.0.0.1:${API_PORT}/health" \
  | python3 -c 'import json,sys; assert json.load(sys.stdin) == {"status":"ready"}'
