# FastAPI Zellit Benchmark Report Design

## Purpose

Run the complete FastAPI Zellit performance suite and produce a portable HTML summary backed by preserved benchmark artifacts. The report describes this implementation, workload, machine, and run only; it must not present a general framework ranking.

## Scope

Run one trial of each performance profile through the existing FastAPI Compose benchmark runner:

1. `baseline`
2. `staircase`
3. `sustained`
4. `overload`, with its explicit opt-in enabled

The correctness-only `smoke` profile is outside this run because the selected full suite is the standard performance profiles plus overload. Existing benchmark code, profiles, application behavior, and runtime settings will not be changed.

## Execution

Commands run from `research/demo/shared/zellit/benchmark/` in the `fastapi-zellit` worktree. Every profile receives a unique timestamped run ID. The runs reuse the same FastAPI Compose stack where practical to avoid repeated setup, and the final run cleans up containers and named volumes.

Each runner invocation must finish successfully before the next starts. A failure stops the sequence, preserves available artifacts, cleans up the Compose stack, and is reported rather than hidden or retried without disclosure.

## Inputs and Evidence

For each successful run, the report generator reads:

- `config.json` for the rendered Artillery workload;
- `raw.json` for measured Artillery metrics;
- `metadata.json` for run identity and tool versions; and
- `runtime.json` for server, worker, concurrency, and database-pool settings.

The report links every summarized profile to its artifact directory. The run directories remain under `research/demo/shared/zellit/benchmark/results/` and retain their existing ignored-artifact policy.

## Report Contents

Create a standalone file at:

`research/reports/fastapi-zellit-<timestamp>.html`

The file uses embedded CSS and SVG only, with no CDN or external runtime dependency. It contains:

- an executive summary;
- profile comparison cards and charts;
- request throughput and total request counts;
- HTTP error or failed-request counts and rates;
- p50, p95, p99, and maximum response latency where Artillery emitted them;
- each profile's phase configuration;
- Git revision, benchmark timestamp, implementation identity, dataset and request-corpus identity;
- Python, FastAPI, SQLAlchemy, asyncpg, Uvicorn, PostgreSQL, Node, pnpm, and Artillery versions when present;
- worker, concurrency model, database driver, pool size, and overflow settings;
- source artifact paths; and
- methodology and interpretation caveats.

Missing metrics are shown as unavailable and explained. Values are never inferred when absent from raw artifacts.

## Interpretation Rules

All measured conclusions are labeled as workload-specific benchmark observations. The report states that:

- each profile has only one trial;
- the profiles apply different offered loads and durations;
- overload is intentionally stressful and is not a normal operating target;
- results are not a FastAPI-versus-Django comparison; and
- no broad framework or production-capacity conclusion follows from this run alone.

The executive summary may identify measured latency, throughput, or errors, but only with direct values from these artifacts and explicit profile context.

## Validation

Before delivery:

1. Confirm all four runner commands exit successfully.
2. Confirm every run directory contains nonempty `config.json`, `raw.json`, `metadata.json`, and `runtime.json`.
3. Parse every JSON artifact successfully.
4. Cross-check the report's displayed headline values against the raw JSON.
5. Confirm the generated HTML is nonempty, contains all four run IDs, and has no external asset references.
6. Confirm the Compose project is cleaned up.

The final response provides the report path, run artifact directories, concise headline observations, and any caveats or failures.
