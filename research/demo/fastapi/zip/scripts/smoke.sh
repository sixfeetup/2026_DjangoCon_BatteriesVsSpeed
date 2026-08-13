#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cleanup() { docker compose down -v --remove-orphans; }
trap cleanup EXIT

docker compose down -v --remove-orphans
docker compose up --build --wait api
response="$(curl --fail --silent --show-error 'http://localhost:8000/zip-codes?q=462')"
python3 - "$response" <<'PY'
import json
import sys
records = json.loads(sys.argv[1])
assert len(records) == 10, records
by_zip = {record["zip"]: record["city"] for record in records}
assert by_zip["46201"] == "Indianapolis", records
assert by_zip["46202"] == "Indianapolis", records
PY
curl --fail --silent --show-error 'http://localhost:8000/health' \
  | python3 -c 'import json,sys; assert json.load(sys.stdin) == {"status":"ready"}'
