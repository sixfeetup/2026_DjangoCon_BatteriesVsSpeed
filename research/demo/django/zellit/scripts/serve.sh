#!/bin/sh
set -eu

require_integer() {
  name="$1"; value="$2"
  case "$value" in *[!0-9]*|'') echo "$name must be a non-negative integer" >&2; exit 2;; esac
}

: "${GUNICORN_BIND:?GUNICORN_BIND is required}"
: "${GUNICORN_WORKER_CLASS:?GUNICORN_WORKER_CLASS is required}"
: "${GUNICORN_WORKERS:?GUNICORN_WORKERS is required}"
: "${GUNICORN_THREADS:?GUNICORN_THREADS is required}"
: "${GUNICORN_WORKER_CONNECTIONS:?GUNICORN_WORKER_CONNECTIONS is required}"
: "${GUNICORN_TIMEOUT:?GUNICORN_TIMEOUT is required}"
: "${GUNICORN_KEEPALIVE:?GUNICORN_KEEPALIVE is required}"
case "$GUNICORN_WORKER_CLASS" in sync|gevent) ;; *) echo "invalid worker class" >&2; exit 2;; esac
for pair in "workers:$GUNICORN_WORKERS" "threads:$GUNICORN_THREADS" "worker_connections:$GUNICORN_WORKER_CONNECTIONS" "timeout:$GUNICORN_TIMEOUT" "keepalive:$GUNICORN_KEEPALIVE"; do
  require_integer "${pair%%:*}" "${pair#*:}"
done

access_log="--access-logfile=-"
case "${GUNICORN_ACCESS_LOG_ENABLED:-false}" in
  true) ;;
  false) access_log="--access-logfile=/dev/null" ;;
  *) echo "GUNICORN_ACCESS_LOG_ENABLED must be true or false" >&2; exit 2;;
esac

exec gunicorn \
  --config /code/gunicorn.conf.py \
  --bind "$GUNICORN_BIND" \
  --worker-class "$GUNICORN_WORKER_CLASS" \
  --workers "$GUNICORN_WORKERS" \
  --threads "$GUNICORN_THREADS" \
  --worker-connections "$GUNICORN_WORKER_CONNECTIONS" \
  --timeout "$GUNICORN_TIMEOUT" \
  --keep-alive "$GUNICORN_KEEPALIVE" \
  --log-level "$(printf '%s' "${DJANGO_LOG_LEVEL:-ERROR}" | tr '[:upper:]' '[:lower:]')" \
  "$access_log" \
  config.wsgi:application
