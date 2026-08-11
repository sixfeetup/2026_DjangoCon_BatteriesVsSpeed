# FastAPI ZIP Typeahead Demo Design

## Purpose

Build the first benchmark demo for the DjangoCon presentation: a FastAPI endpoint that performs a Redis-backed ZIP-code typeahead lookup. The demo must be reproducible, easy to run through Docker Compose, and suitable for a later equivalent comparison with Django Ninja.

The benchmark measures this workload and implementation only. It must not be presented as a universal framework ranking.

## Scope

This work includes:

- A shared, deterministic Faker-based ZIP dataset generator and canonical dataset.
- A FastAPI ZIP lookup application.
- Redis storage and one-shot seeding through Docker Compose.
- Unit, integration, API contract, and Compose smoke tests.
- Artillery profiles runnable from both the host and Docker Compose.
- A run-specific raw-results structure and benchmark metadata.

This work does not include:

- The Django Ninja implementation.
- The PostgreSQL/Zellit demos.
- Cross-framework benchmark conclusions.
- Automated CPU or memory collection.
- Changes to presentation slides.

## Repository Layout and Boundaries

### Shared ZIP data

Shared data assets live under `research/demo/shared/zip/`. This is a uv-managed Python project whose only responsibility is generating and validating canonical ZIP fixtures.

It contains:

- A generator using a fixed Faker seed and pinned Faker dependency.
- A committed 50,000-record JSONL artifact.
- A manifest containing the seed, record count, generator version, and artifact checksum.
- A deterministic benchmark-query corpus.
- Shared Artillery scenarios under `research/demo/shared/zip/benchmark/`.

The two ZIP demos consume this exact ZIP artifact. The two Zellit demos will consume their own shared canonical Faker artifact when designed. No framework implementation invokes Faker independently, so paired demos cannot produce different records.

### FastAPI application

The application lives under `research/demo/fastapi/zip/` as its own uv-managed Python project. Its HTTP layer and Redis repository are separate units:

- The HTTP layer validates requests, maps expected infrastructure errors, and serializes responses.
- The repository owns Redis prefix-query and member-decoding behavior.
- Application lifespan owns creation and closure of the async Redis client/pool.

The benchmark server uses one Uvicorn worker, an explicit command, and no development reload. Server settings and dependency versions are pinned and recorded.

FastAPI documents that lifespan code before `yield` runs before application startup and code after `yield` runs after application shutdown:

- FastAPI 0.141.1, `fastapi/advanced/events.md`, “Lifespan function” — https://fastapi.tiangolo.com/advanced/events/

### Compose environment

Docker Compose defines:

- `redis`: a pinned Redis image with a health check.
- `seed`: a one-shot service that loads the canonical dataset after Redis is healthy.
- `api`: the FastAPI service, started after successful seeding.
- `artillery`: an optional profile that executes the same scenarios available to host-side Artillery.

Data generation, Redis seeding, request handling, and load generation remain independently understandable and testable.

## Canonical Data Design

Each JSONL record has this shape:

```json
{"zip":"46201","city":"Indianapolis"}
```

Generation requirements:

- Exactly 50,000 records.
- Every ZIP is a unique, zero-padded, five-digit ASCII string.
- Records are sorted by ZIP.
- Faker generation uses a fixed seed and pinned version.
- `46201` and `46202` are reserved as Indianapolis showcase records before Faker fills the remaining records.
- Re-running the generator with the same inputs produces the manifest’s expected checksum.
- The generated artifact is committed to the repository.

The benchmark-query corpus contains 100 deterministic three-digit prefixes selected evenly from eligible prefixes in the canonical artifact. Every selected prefix must return at least 10 records. This keeps measured response sizes fixed while avoiding a single permanently repeated query.

## Redis Data Model and Seeding

Redis uses one sorted set. Every member has score zero and is encoded as:

```text
<five-digit ZIP><TAB><city>
```

Because the ZIP begins each member and every score is equal, one bounded lexicographical query can retrieve prefix matches. The repository requests at most 10 members, preserves ZIP order, and splits each member at the first tab.

The seed service:

1. Reads the committed canonical JSONL artifact.
2. Validates records while loading them into a temporary sorted-set key.
3. Writes checksum and count into a temporary metadata key.
4. Uses one Redis transaction to promote both temporary keys to their production names.
5. Exits successfully only after the final data and metadata keys are available and consistent.

A failed seed must not expose partial new data as a ready production dataset.

## HTTP Contract

### ZIP lookup

Request:

```http
GET /zip-codes?q=462
```

Successful response:

```json
[
  {"zip":"46201","city":"Indianapolis"},
  {"zip":"46202","city":"Indianapolis"}
]
```

Contract:

- `q` is required.
- `q` contains one through five ASCII digits and no other characters.
- Results are ordered by ZIP.
- At most 10 records are returned.
- No match returns `200 OK` with `[]`.
- Invalid input uses FastAPI’s standard `422 Unprocessable Entity` response.
- A Redis connection or command failure returns `503 Service Unavailable` with:

  ```json
  {"detail":"ZIP lookup temporarily unavailable"}
  ```

Only expected Redis infrastructure failures are translated to `503`. Unexpected programming errors remain `500` and are logged.

Request flow:

1. FastAPI validates `q`.
2. The route calls the Redis repository.
3. The repository performs one async lexicographical prefix query.
4. Members are decoded into typed response objects.
5. FastAPI serializes the response.

### Health endpoint

`GET /health` checks both Redis connectivity and canonical dataset readiness metadata.

- Ready returns `200`.
- Redis unavailable or dataset absent/mismatched returns `503`.
- Artillery does not include health requests in measured traffic.

## Benchmark Design

### Workload

Artillery selects requests from the deterministic three-digit prefix corpus. Each request expects a `200` response containing 10 ZIP records. Any non-`200` response or failed assertion counts as an error.

The committed defaults are:

| Profile | Load | Purpose |
|---|---:|---|
| Smoke | 1 request/second for 10 seconds | Validate wiring and correctness |
| Baseline | 5 requests/second for 60 seconds | Observe low-contention latency |
| Staircase | 25, 50, 100, 200, 400, then 800 requests/second for 45 seconds each | Locate throughput and latency knees |
| Sustained | 200 requests/second for 5 minutes by default | Observe stability near meaningful load |
| Overload | 1,200 requests/second for 30 seconds when explicitly enabled | Observe explicit failure behavior |

The staircase has a 20-second warm-up at 10 requests/second. Rates and durations can be overridden through environment configuration without changing the committed scenario. After trial runs, the recorded official sustained rate replaces the 200 requests/second default when necessary to exercise a meaningful point near the first implementation's saturation knee.

These values are request arrival rates, not claims about concurrent connections.

### Execution paths

The same scenarios support:

- A documented host-side command run with pnpm from `research/demo/shared/zip/benchmark/`, using a pinned Artillery development dependency and lockfile.
- A pinned Docker-based Artillery service selected through a Compose profile.

Both paths read the scenarios and prefix corpus from the shared benchmark directory, accept the target URL through configuration, and write compatible raw output beneath `research/demo/shared/zip/benchmark/results/<run-id>/`.

### Results and metadata

Each execution writes to a run-specific results directory. A run records:

- Run identifier and timestamps.
- Git revision.
- Target implementation and URL.
- Profile and effective stage settings.
- Python, application, Redis, Uvicorn, and Artillery versions.
- Relevant configuration and environment notes.
- Raw Artillery JSON output.

Official comparative runs begin only after the Django Ninja equivalent exists. They must:

- Use identical container limits, dataset, request corpus, and server configuration where applicable.
- Include at least three measured repetitions.
- Alternate framework execution order.
- Report achieved throughput, p50, p95, p99, and errors for every stage.
- Reject results where the load generator itself is saturated.

The sustained rate is selected after staircase trial runs rather than assumed in advance.

## Error Handling

Expected behavior is explicit and observable:

- Invalid query: `422`.
- Valid query with no match: `200` and an empty list.
- Redis unavailable during lookup: stable `503` body.
- Redis unavailable or wrong/missing dataset during health check: `503`.
- Unexpected application defect: logged `500`.
- Seed failure: nonzero one-shot service exit and no partial production key.

There are no automatic request retries. Retries would alter the workload’s measured latency and obscure infrastructure failures.

## Testing Strategy

Implementation follows test-driven development.

### Generator tests

Verify:

- Identical seed and versions reproduce the expected checksum.
- There are exactly 50,000 records.
- ZIP values are unique, sorted, and five ASCII digits.
- Showcase records are present and correct.
- Manifest count and checksum match the artifact.
- Every benchmark prefix has at least 10 matches.

### Repository tests

Run against real Redis and verify:

- Correct boundaries for one-, two-, three-, four-, and five-digit prefixes.
- Stable ZIP ordering.
- The 10-result limit.
- Empty matches.
- Member decoding.
- Redis failures are distinguishable from decoding/programming defects.

Real Redis is required because lexicographical sorted-set behavior is central to the demo.

### API contract tests

Verify:

- Successful response shape and ordering.
- Empty result response.
- Empty, non-digit, Unicode-digit, and overlong query rejection.
- Stable Redis `503` translation.
- Unexpected errors are not translated to `503`.
- Lifespan setup and cleanup.
- Health readiness and failure states.

FastAPI documents using `TestClient` as a context manager when tests need lifespan execution:

- FastAPI 0.141.1, `fastapi/advanced/testing-events.md`, “Testing Events: lifespan and startup - shutdown” — https://fastapi.tiangolo.com/advanced/testing-events/

### System checks

A fresh Compose smoke test verifies:

1. Redis becomes healthy.
2. The one-shot seed succeeds.
3. The API becomes ready.
4. A `q=462` request returns the expected Indianapolis records.

An Artillery smoke check verifies both supported execution paths, raw-output creation, and the absence of unexpected response or transport errors.

## Reproducibility Constraints

- All Python projects use uv for Python pinning, dependency management, locking, synchronization, and command execution.
- The new Python projects pin the latest stable CPython version available through uv at implementation time, excluding prereleases.
- Python, Redis, Uvicorn, and Artillery versions are pinned.
- Generated fixture bytes and their checksum are shared across framework implementations.
- Benchmark defaults are committed; machine-specific calibration is recorded rather than silently editing scenarios.
- Raw official benchmark artifacts are retained in the repository with run metadata.

## Success Criteria

The design is implemented successfully when:

- A fresh checkout can generate or verify the canonical artifact using uv.
- Docker Compose can start Redis, seed it once, and expose a healthy FastAPI service.
- `GET /zip-codes?q=462` satisfies the documented response.
- Validation and Redis failure behavior match the contract.
- Automated tests pass, including real-Redis repository tests and the Compose smoke path.
- Artillery smoke, baseline, staircase, and sustained profiles are runnable from both host and Compose.
- Runs create raw output and sufficient metadata for later reproduction.
- No benchmark result is framed as a framework-wide conclusion.
