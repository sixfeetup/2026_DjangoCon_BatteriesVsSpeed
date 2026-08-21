# Django Zellit

Django Zellit is the Django implementation of the reproducible Zellit PostgreSQL
workload. It exposes a public, read-only Django Ninja API, the same domain in
Django admin, and controlled Gunicorn `gevent-1`, `sync-1`, and labeled custom
runtime modes. Smoke runs prove wiring and response correctness only; they are
not performance evidence.

## Provenance and pinned tools

The project was rendered from local AlphaKit source at `~/src/alphakit`, commit
`b9ee939e0fc6765320cd22e29d6be244db30062b`:

```sh
copier copy \
  --vcs-ref=b9ee939e0fc6765320cd22e29d6be244db30062b \
  --data project_name=zellit \
  ~/src/alphakit \
  research/demo/django/zellit
```

The Django and data images both use CPython 3.12.12. Effective locked versions
accepted with this implementation are Django 5.2.11, Django Ninja 1.5.3,
Gunicorn 25.1.0, gevent 25.9.1, django-db-geventpool 4.0.8, Django's
psycopg2-binary 2.9.11 adapter, and shared-loader psycopg/psycopg-binary 3.3.4.
The data image pins uv 0.11.26 and PostgreSQL is `postgres:18.1`. Benchmark Node
22.23.2, pnpm 11.21.0, and Artillery 2.0.33 are pinned by `.nvmrc` and the
benchmark `package.json`/lockfile. Python application versions are locked in
`requirements.txt`; shared Python versions are locked in
`../../shared/zellit/uv.lock`. Every Compose benchmark records applicable
effective versions, image IDs, data identity, corpus identity, and runtime
settings rather than relying on this summary.

## Prerequisites and first build

Run commands in this section from `research/demo/django/zellit/`. You need
Docker with Compose, `curl`, Python 3, and enough disk for the generated
2.2-million-row dataset and PostgreSQL volume.

```sh
cp .env-dist .env
docker compose build api dataset
docker compose config --quiet
```

`.env` is local and ignored. The measured API always runs files copied into the
built image—there is no source bind mount or Django development server.

## Generate and verify the shared dataset

For host-side generation, install [uv](https://docs.astral.sh/uv/) and run:

```sh
cd ../../shared/zellit
uv sync --frozen
uv run zellit-data generate \
  --spec data/spec.json \
  --output data/generated \
  --zip-input data/zip_codes.csv
uv run zellit-data verify \
  --spec data/spec.json \
  --manifest data/manifest.json \
  --output data/generated
cd ../../django/zellit
```

The Compose `dataset` service performs equivalent canonical generation into the
`zellit-generated` volume. To create a fresh database, migrate, and seed it:

```sh
docker compose down --volumes --remove-orphans
docker compose up --build dataset migrate seed
```

Seeding verifies every generated artifact and commits all tables plus readiness
metadata in one transaction. Subsequent starts use `--if-needed`, so changing
runtime does not reload matching canonical data.

## Tests and system checks

```sh
docker compose --profile utility run --rm utility pytest -q
docker compose --profile utility run --rm utility python manage.py check
docker compose --profile utility run --rm utility \
  python manage.py makemigrations --check
```

The suite includes PostgreSQL-backed model/admin/API tests, exact five-query
budget checks at multiple page sizes, health checks, and runtime normalization.
The complete two-runtime clean-system acceptance is:

```sh
CLEAN_START=1 CLEANUP=1 ./scripts/smoke.sh
```

It generates and seeds a fresh canonical database, validates the full `46201`
page under both presets, requires byte-identical responses, then removes the
stack and volumes.

## Django admin

With the stack prepared, create a superuser and start an API runtime:

```sh
docker compose --profile utility run --rm utility \
  python manage.py createsuperuser
python3 scripts/render_runtime.py gevent-1 \
  --env-file .runtime.env --json-file runtime.json
docker compose --env-file .runtime.env up -d --wait api
```

Open <http://127.0.0.1:8000/admin/>. All Zellit domain models are registered;
admin traffic is not benchmark traffic.

## Runtime selection

`runtime-presets.json` is the source of truth. The renderer writes both the
exact Compose environment and normalized metadata.

Start the one-worker Gunicorn/gevent preset:

```sh
python3 scripts/render_runtime.py gevent-1 \
  --env-file .runtime.env --json-file runtime.json
docker compose --env-file .runtime.env up -d --wait api
```

Switch the same image and canonical database to one synchronous worker:

```sh
python3 scripts/render_runtime.py sync-1 \
  --env-file .runtime.env --json-file runtime.json
docker compose --env-file .runtime.env up -d --no-deps --force-recreate api
```

A custom runtime requires a safe, nonempty label and explicit worker/database
modes. For example, synchronous Gunicorn with four workers:

```sh
RUNTIME_LABEL=sync-4 \
DJANGO_DATABASE_MODE=standard \
GUNICORN_WORKER_CLASS=sync \
GUNICORN_WORKERS=4 \
DJANGO_CONN_MAX_AGE=60 \
python3 scripts/render_runtime.py custom \
  --env-file .runtime.env --json-file runtime.json
docker compose --env-file .runtime.env up -d --no-deps --force-recreate api
```

The custom renderer also accepts the documented `GUNICORN_THREADS`,
`GUNICORN_WORKER_CONNECTIONS`, `GUNICORN_TIMEOUT`, `GUNICORN_KEEPALIVE`,
`DJANGO_GEVENT_POOL_MAX`, and logging overrides. Invalid or mismatched gevent
worker/database selections fail before startup.

Check readiness and the measured endpoint:

```sh
curl --fail --silent http://127.0.0.1:8000/health
curl --fail --silent \
  'http://127.0.0.1:8000/api/v1/zip-codes/46201/listings?limit=20&offset=0'
```

## Artillery

Initialize the pinned host toolchain from the repository root:

```sh
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use
export PATH="$NVM_BIN:$PATH"
test "$(node --version)" = v22.23.2
cd research/demo/shared/zellit/benchmark
corepack pnpm install --frozen-lockfile
corepack pnpm test
```

### Compose runs

Compose runs fix the target to `http://api:8000`, normalize the runtime before
startup, and discover metadata from the actual containers:

```sh
RUN_ID=zellit-gevent-smoke CLEANUP=0 \
  ./scripts/run-compose.sh smoke gevent-1
RUN_ID=zellit-sync-smoke CLEANUP=0 \
  ./scripts/run-compose.sh smoke sync-1
RUN_ID=zellit-gevent-staircase CLEANUP=0 \
  ./scripts/run-compose.sh staircase gevent-1
RUN_ID=zellit-gevent-sustained CLEANUP=1 \
  ./scripts/run-compose.sh sustained gevent-1
```

Overload is deliberately opt-in:

```sh
ENABLE_OVERLOAD=1 RUN_ID=zellit-gevent-overload CLEANUP=1 \
  ./scripts/run-compose.sh overload gevent-1
```

`CLEANUP=0` preserves containers and the canonical database. `CLEANUP=1`
removes containers and volumes after the run while preserving the command's
exit status.

### Host smoke against local Compose

Start a preset as shown above, initialize the Node workspace, then run host
Artillery with explicit target identity. The runner intentionally refuses to
infer Compose metadata for an arbitrary URL.

```sh
# From research/demo/shared/zellit/benchmark:
export RUN_METADATA_JSON="$(node - <<'NODE'
const {execFileSync} = require('node:child_process')
const out = (cmd, args) => execFileSync(cmd, args, {encoding: 'utf8'}).trim()
const repo = out('git', ['rev-parse', '--show-toplevel'])
const compose = ['compose', '-f', `${repo}/research/demo/django/zellit/compose.yml`]
const pyPackage = name => out('docker', [...compose, 'exec', '-T', 'api',
  'python', '-c', 'import importlib.metadata,sys;print(importlib.metadata.version(sys.argv[1]))', name])
process.stdout.write(JSON.stringify({
  git_revision: out('git', ['-C', repo, 'rev-parse', 'HEAD']),
  alphakit_revision: 'b9ee939e0fc6765320cd22e29d6be244db30062b',
  implementation: 'django-zellit-local-compose',
  dataset: {schema_version: '1', generator_version: '1', seed: 20260813,
    digest: 'd631bfe327777c65a45098f536c9124c822a854480352e5f4564ce62946f3862'},
  request_corpus: {rows: 500,
    sha256: 'b2e6fa0b91ccc3e02e56855e6ec5f475c6b24d241eb165c6c3f509c09cda06e1'},
  versions: {python: out('docker', [...compose, 'exec', '-T', 'api', 'python', '--version']),
    django: pyPackage('Django'), django_ninja: pyPackage('django-ninja'),
    gunicorn: pyPackage('gunicorn'), gevent: pyPackage('gevent'),
    django_db_geventpool: pyPackage('django-db-geventpool')},
  images: {django: out('docker', [...compose, 'images', '-q', 'api']),
    data: out('docker', [...compose, 'images', '-q', 'dataset']),
    postgresql: out('docker', [...compose, 'images', '-q', 'db'])}
}))
NODE
)"
RUN_ID=zellit-host-smoke \
RUNTIME_JSON_PATH=../../../django/zellit/runtime.json \
  ./scripts/run.sh smoke http://127.0.0.1:8000
```

Each unique run ID creates `results/<run-id>/config.json`, `raw.json`,
`metadata.json`, and (when supplied) `runtime.json`. Metadata is finalized after
success, failure, or interruption. Existing run directories are never replaced.
Do not interpret smoke throughput or latency as a performance result.

## Teardown

Keep the canonical database for later runtime changes:

```sh
docker compose down --remove-orphans
```

Delete containers, generated-data volume, and canonical PostgreSQL database:

```sh
docker compose down --volumes --remove-orphans
```
