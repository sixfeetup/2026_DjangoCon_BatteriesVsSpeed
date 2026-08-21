# FastAPI Zellit Benchmark Demo Design

## Purpose

Build an independently runnable FastAPI implementation of the Zellit listings demo so the existing shared Artillery workload can compare it with the Django implementation. The FastAPI application must consume the same deterministic Zellit seed artifacts and expose the same measured HTTP contract while owning its application code, schema migrations, PostgreSQL database, generated-data volume, and runtime configuration.

The benchmark measures these implementations and this workload only. It must not be presented as a universal framework ranking.

## Scope

This work includes:

- A uv-managed FastAPI project at `research/demo/fastapi/zellit/`.
- Async SQLAlchemy 2.x with asyncpg and Pydantic response models.
- FastAPI-owned Alembic migrations for the shared `zellit_*` schema contract.
- An isolated Docker Compose stack with PostgreSQL, migration, dataset generation, seeding, API, and optional Artillery services.
- The same measured endpoint, response, validation, ordering, and five-query success-path workload as Django.
- Dataset-readiness health checks.
- Unit, integration, API contract, migration, query-count, lifecycle, harness, and Compose smoke tests.
- A dedicated shared `run-fastapi-compose.sh` benchmark runner and complete reproducibility metadata.

This work does not include:

- Sharing a database, container, or named volume with Django.
- Changing the canonical Zellit dataset or request corpus.
- Changing the existing Django benchmark runner.
- Multi-worker scaling experiments.
- Producing comparative benchmark conclusions.
- Changing presentation slides.

## Locked Decisions

- The project uses CPython 3.12.12, matching Django Zellit and the shared data image.
- The API uses async SQLAlchemy with asyncpg.
- The server uses one Uvicorn worker with no development reload and no access log during benchmark runs.
- The SQLAlchemy pool has a fixed size of 20 and no overflow.
- A successful measured endpoint request executes exactly five SQL statements.
- The FastAPI project owns its schema through Alembic.
- The FastAPI Compose stack owns an isolated PostgreSQL database and volumes.
- Shared artifacts are limited to `research/demo/shared/zellit` deterministic data and benchmark tooling.
- The shared harness gains `run-fastapi-compose.sh PROFILE`; Django's `run-compose.sh` remains unchanged.

## Architecture and Boundaries

### Application layout

The FastAPI project lives at `research/demo/fastapi/zellit/` and separates these responsibilities:

- `app.py`: application factory, lifespan, routes, and HTTP exception mapping.
- `config.py`: validated environment-backed database, dataset, and pool settings.
- `database.py`: async engine and session-factory construction plus the request-scoped session dependency.
- `models.py`: SQLAlchemy mappings for the shared `zellit_*` relational schema.
- `schemas.py`: Pydantic response models matching the public Django JSON contract.
- `repository.py`: five explicit read queries and deterministic response assembly.
- `migrations/`: Alembic environment and revisions that create the schema independently.
- `scripts/smoke.sh`: fresh-stack correctness and deterministic-response smoke checks.

These units have narrow interfaces: routes depend on a request-scoped session and repository operation; the repository depends on SQLAlchemy models/statements; schemas depend only on returned data; and Compose orchestration depends only on documented commands and health outcomes.

### FastAPI resource lifecycle

Application lifespan creates the shared async engine and session factory before serving requests and disposes the engine during shutdown. One `AsyncSession` is yielded and closed per request through a FastAPI dependency.

FastAPI documents lifespan as the mechanism for application-wide startup and shutdown resources, including database connection pools. It also documents `yield` dependencies as a way to provide and close a database session after a request:

- FastAPI 0.141.1, `fastapi/advanced/events.md`, “Lifespan Events” and “Lifespan” — https://fastapi.tiangolo.com/advanced/events/
- FastAPI 0.141.1, `fastapi/tutorial/dependencies/dependencies-with-yield.md`, “A database dependency with `yield`” — https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/

FastAPI does not require a particular database library; its SQL tutorial explicitly permits other SQL or NoSQL libraries and describes Alembic as the production migration path. Direct SQLAlchemy is selected here for explicit async-session and advanced-query control:

- FastAPI 0.141.1, `fastapi/tutorial/sql-databases.md`, “SQL (Relational) Databases” and “Create Database Tables on Startup” — https://fastapi.tiangolo.com/tutorial/sql-databases/

## Schema Ownership and Shared Data

Alembic creates the existing loader-facing table names:

- `zellit_zip_code`
- `zellit_actor`
- `zellit_listing`
- `zellit_photo`
- `zellit_comment`
- `zellit_listing_vote`
- `zellit_comment_vote`
- `zellit_dataset_metadata`

Columns, PostgreSQL types, primary and foreign keys, cascade behavior, uniqueness constraints, check constraints, and indexes must match the canonical shared-loader contract and Django schema. In particular, loader column names such as `zip_code_id`, `listing_id`, `actor_id`, and `comment_id` must remain exact.

The FastAPI Compose stack invokes the shared generator and transactional loader without modifying them. Generated CSV files live in a FastAPI-stack named volume, and PostgreSQL data lives in a separate FastAPI-stack named volume. No Django service or volume is referenced.

## HTTP Contract

### Listings endpoint

Request:

```http
GET /api/v1/zip-codes/46201/listings?limit=20&offset=0
```

Validation:

- `zip_code` is exactly five ASCII digits.
- `limit` defaults to 20 and accepts 1 through 50.
- `offset` defaults to 0 and accepts 0 through 199.
- Invalid path or query values return FastAPI's standard `422 Unprocessable Entity` response.

Success returns `200 OK` with exactly these top-level fields:

```json
{
  "zip_code": {},
  "market": {},
  "pagination": {},
  "listings": []
}
```

The complete nested fields and serialized types match the Django `ListingsResponseSchema` contract. Listings are ordered by ID, photos by position, and comments by ID. Pagination reports the requested limit and offset plus the actual returned count.

A valid but unknown ZIP returns:

```json
{"detail":"ZIP code not found"}
```

with `404 Not Found`.

### Health endpoint

`GET /health` reads the singleton `zellit_dataset_metadata` record and compares its schema version, dataset digest, and complete row-count object with settings supplied by shared `data/dataset.env`.

- Matching metadata returns `200 {"status":"ready"}`.
- Missing, mismatched, or unavailable metadata returns `503 {"detail":"Zellit dataset is not ready"}`.
- Artillery sends no health requests in measured traffic.

## Five-Query Data Flow

Every successful listings request executes exactly these five SQL statements:

1. Fetch ZIP code, city, state, and demographic columns.
2. Count all listings for the ZIP and calculate the rounded average price.
3. Fetch the requested listing page ordered by ID, including listing vote sums and comment counts.
4. Fetch all photos for returned listing IDs, ordered by listing ID and position.
5. Fetch all comments for returned listing IDs with actor handles and comment vote sums, ordered by listing ID and comment ID.

The repository groups photos and comments by listing ID in memory, assembles the response as plain typed data, and returns it for Pydantic validation and JSON serialization. It does not traverse lazy relationships or perform serialization-time database access.

The five-query invariant exists to preserve the paired benchmark's SQL workload. Outside this comparison, query count would be selected from clarity, query plans, and measured behavior rather than treated as an inherent FastAPI rule.

## Compose and Startup Flow

The isolated Compose stack defines:

1. `db`: pinned PostgreSQL with a readiness check and a FastAPI-specific data volume.
2. `migrate`: the FastAPI image running Alembic after PostgreSQL is healthy.
3. `dataset`: the shared Zellit data image generating verified canonical CSV files into a FastAPI-specific volume.
4. `seed`: the shared transactional loader, after migration and generation complete successfully.
5. `api`: one-worker Uvicorn, started only after successful seeding.
6. `artillery`: optional benchmark-profile service targeting the internal API origin.

Migration, generation, or seed failures exit nonzero and prevent API startup. The API health check gates benchmark startup.

The engine uses an explicit pool size of 20 and `max_overflow=0`. The application command and benchmark metadata record one Uvicorn worker. These settings do not silently vary by environment during official runs.

## Error Handling

- Invalid request input: standard `422`.
- Unknown valid ZIP: stable `404` body.
- Dataset absent or mismatched: stable health `503` body.
- Database error during health: logged and translated to the same health `503`.
- Unexpected endpoint or database defect: logged `500`, not mislabeled as an availability response.
- Migration, generation, or seed failure: nonzero service exit with no ready API.
- No API or benchmark request retries.

This preserves observable failures and prevents retries from changing measured latency or workload.

## Benchmark Integration

Add this command beneath the shared benchmark workspace:

```text
research/demo/shared/zellit/benchmark/scripts/run-fastapi-compose.sh PROFILE
```

Supported profiles remain `smoke`, `baseline`, `staircase`, `sustained`, and opt-in `overload`. The runner validates its profile and overload opt-in before touching Compose.

The runner:

- Starts and waits for the isolated FastAPI stack.
- Fixes the measured target to `http://api:8000`.
- Reuses the committed request corpus, renderer, processor, profiles, and result layout.
- Uses implementation identity `fastapi-zellit`.
- Records Python, FastAPI, SQLAlchemy, asyncpg, Uvicorn, and PostgreSQL versions.
- Records API, data, Artillery, and PostgreSQL image IDs.
- Records Git revision, dataset identity, request-corpus checksum, effective resource limits, and notes.
- Supplies fixed normalized runtime metadata describing one Uvicorn worker, async SQLAlchemy/asyncpg, pool size 20, and overflow 0.
- Preserves finalized run metadata on success, failure, or interruption.
- Never overwrites an existing run ID.
- Honors the same cleanup and overload safeguards as the Django runner.

The existing Django `run-compose.sh` and runtime normalization remain unchanged. Host-target execution through the existing shared `run.sh` remains available when supplied complete explicit metadata and runtime identity.

Smoke output establishes wiring and correctness only and cannot support a throughput or framework-ranking claim.

## Testing Strategy

Implementation follows test-driven development.

### API contract tests

Verify:

- Exact successful top-level and nested response contract.
- Default and explicit pagination.
- Stable ordering and returned counts.
- Rejection of short, long, non-digit, and Unicode-digit ZIP values.
- Pagination boundary and type rejection.
- Stable unknown-ZIP `404`.
- Ready and not-ready health responses.
- Unexpected repository defects remain `500`.

### Repository integration tests

Against real PostgreSQL, verify:

- Correct ZIP and market values.
- Listing, photo, and comment ordering.
- Vote-score and comment-count aggregates.
- Deterministic nested grouping.
- Unknown ZIP behavior.
- Exactly five statements for successful limits 1, 20, and 50.
- Pydantic serialization performs no additional SQL.

SQLAlchemy query-event instrumentation counts statements around the repository call.

### Migration and schema tests

Upgrade an empty PostgreSQL database with Alembic and verify every shared-loader-required table, column, foreign key, constraint, and index. Run the shared loader against the migrated schema to prove contract compatibility.

### Lifecycle and configuration tests

Verify engine/session setup and disposal, one session per request, required dataset settings, and rejection of invalid pool or readiness configuration. When tests require lifespan execution, use `TestClient` as a context manager as documented by FastAPI:

- FastAPI 0.141.1, `fastapi/advanced/testing-events.md`, “Testing Events: lifespan and startup - shutdown” — https://fastapi.tiangolo.com/advanced/testing-events/

### Harness and system tests

Verify:

- The new runner's profile validation and overload guard.
- FastAPI implementation and runtime metadata.
- Existing run-directory non-overwrite behavior.
- FastAPI Compose paths without changing Django runner behavior.
- A fresh-volume Compose smoke startup through migrate, generate, seed, health, and canonical response checks.
- An Artillery smoke run accepted by the existing response processor.

Existing shared Zellit and benchmark suites remain passing. Relevant FastAPI ZIP and Django Zellit regression suites remain passing where they do not require unrelated unavailable services.

## Reproducibility Constraints

- Use uv for Python pinning, dependencies, locking, synchronization, and command execution.
- Pin CPython 3.12.12 for parity with the paired Django workload.
- Lock application dependencies and pin container images.
- Use the committed shared data specification, manifest, dataset environment, ZIP source, and request corpus without modification.
- Keep framework databases and volumes isolated.
- Commit benchmark defaults and runtime identity; record machine-specific resource settings rather than silently changing profiles.
- Retain run-specific metadata and raw output for any later reviewed benchmark observation.

## Success Criteria

The design is implemented successfully when:

- A fresh checkout can sync the FastAPI project with uv and run its automated tests.
- Alembic creates a schema accepted by the unchanged shared Zellit loader.
- A fresh isolated Compose stack generates, seeds, starts, and becomes healthy.
- The measured endpoint matches Django's validation, response, ordering, and error contract.
- Every successful measured endpoint request performs exactly five SQL statements at tested page sizes.
- The async engine uses a 20-connection pool with no overflow and Uvicorn runs one worker.
- The existing Artillery processor accepts a FastAPI smoke run from `run-fastapi-compose.sh`.
- Run artifacts contain complete FastAPI, runtime, dataset, corpus, image, and version identity.
- The existing Django runner remains unchanged and its harness tests continue to pass.
- No smoke result is presented as a performance conclusion.
