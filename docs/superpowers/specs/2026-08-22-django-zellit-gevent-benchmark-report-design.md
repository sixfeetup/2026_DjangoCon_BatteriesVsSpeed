# Django Zellit Gevent Benchmark Report Design

## Purpose

Run the same four Zellit workload profiles against Django’s `gevent-1` runtime, publish a standalone HTML report beside the existing FastAPI report, and extend the LAN report server with a safe index for opening either report.

The output is evidence for this implementation, workload, machine, and single trial per profile. It is not a framework ranking and does not calculate a winner or percentage difference.

## Benchmark Scope

Run exactly one trial of each profile through the existing Django Compose runner and the `gevent-1` runtime preset:

1. `baseline`
2. `staircase`
3. `sustained`
4. opt-in `overload`

Use one UTC run stamp across all four run IDs. Reuse the same Compose stack for the first three profiles, then clean containers and named volumes after overload.

Do not change application behavior, runtime settings, profile definitions, request corpus, dataset, or Compose runner. Do not retry a failed run. If baseline, staircase, or sustained fails, stop without generating a successful report. A failed overload may be preserved as explicitly labeled failure evidence if all four artifacts are complete and parseable.

## Artifact Contract

Every run preserves the existing artifact set under `research/demo/shared/zellit/benchmark/results/`:

- `config.json`
- `raw.json`
- `metadata.json`
- `runtime.json`

The report records source artifact paths, status and exit status, effective phases, runtime settings, Git revision, dataset and request-corpus identities, dependency versions, image identities, requests, responses, failures, errors, request rate, p50/p95/p99/max latency, and response-latency sample count.

Latency distributions must state that socket timeout failures do not have Artillery response-latency samples. Any application image-ID change across profiles must be prominently disclosed and cross-profile interpretation qualified.

## Shared Report Generator

Generalize the existing shared report pipeline instead of copying it.

The artifact normalization interface remains framework-neutral. The HTML generator derives display identity from the normalized runs:

- implementation: `django-zellit`
- runtime label: `gevent-1`
- framework display name: `Django`
- report title: `Django Zellit gevent-1 benchmark report`

Existing FastAPI output and tests remain compatible. Framework-specific image keys and version fields are displayed dynamically rather than assuming a `fastapi` image or FastAPI dependency set.

The generator continues to require baseline, staircase, and sustained success. It accepts overload success or failure, rendering failure status and metrics prominently without describing the full suite as successful.

## Report Output

Generate:

`research/reports/django-zellit-gevent-1-${RUN_STAMP}.html`

The report is standalone, with embedded CSS and SVG and no scripts, remote URLs, CDN assets, or external runtime dependencies. It contains:

- executive summary without winner language;
- profile cards and comparison tables;
- status, exit code, offered phases, requests, responses, failure/error counts and rates;
- p50, p95, p99, maximum latency, and latency sample count;
- runtime and dependency metadata;
- per-profile image identity;
- dataset, corpus, Git, and artifact identity;
- methodology, single-trial, timeout-sample, overload, and comparison caveats.

No broad FastAPI-versus-Django conclusion or percentage difference is generated automatically.

## LAN Report Index

Update `corepack pnpm report:serve` so browsers can select either report safely.

### Routes

- `GET /` returns an HTML index of recognized Zellit reports.
- `HEAD /` returns index headers without a body.
- `GET /reports/<filename>` returns that recognized report.
- `HEAD /reports/<filename>` returns report headers without a body.
- Unknown paths and unrecognized filenames return 404.
- Methods other than GET and HEAD return 405 with `Allow: GET, HEAD`.

### Discovery and ordering

Recognized report filenames are regular files matching either:

- `fastapi-zellit-*.html`
- `django-zellit-*.html`

The index orders reports by descending modification time and then descending raw filename. It displays escaped filenames, framework/runtime labels derived from safe filename patterns, and links using URL-encoded path segments.

### Filesystem safety

The server must not expose arbitrary files, directory listings, raw artifacts, traversal paths, decoded separators, symlinks, or non-regular files.

Each report request:

1. decodes exactly one filename segment;
2. rejects malformed encoding, `/`, `\\`, `.`/`..`, and unrecognized patterns;
3. resolves only within `research/reports/`;
4. opens with no-follow behavior where supported;
5. verifies the opened descriptor and current pathname identify the same regular file; and
6. reads from the verified descriptor.

The index performs the same regular-file discovery checks. Files created after startup may appear when the index is refreshed; each report route validates against the current recognized-file set rather than accepting arbitrary paths.

The existing default listener (`0.0.0.0:4173`), host/port overrides, URL output, LAN warning, launcher monitoring, and shutdown behavior remain unchanged.

## Error Handling

- Missing recognized reports: the server may still start and show an empty index with a clear message, allowing a report generated later to appear on refresh.
- Report disappearance or replacement during a request: return generic 404 or 500 without exposing filesystem paths to the client; log details to stderr.
- Invalid configuration or listener failure: fail startup clearly with nonzero status.
- Benchmark profile failure: preserve artifacts and clean Compose resources; do not retry.

## Testing

Use TDD and Node built-ins only.

### Generator tests

- Existing FastAPI rendering remains unchanged where identity is expected.
- Django metadata produces Django/gevent title, labels, versions, images, and runtime fields.
- Mixed implementation or runtime identities across one report are rejected.
- Framework-specific image identity changes are displayed and qualified.
- Failure-aware overload behavior remains correct.

### Server tests

- Index includes both FastAPI and Django reports in deterministic order.
- HTML and URL escaping prevent filename injection.
- Individual recognized reports are served correctly with GET and HEAD.
- Traversal, encoded separators, malformed encodings, symlinks, directories, and unrelated HTML files are rejected.
- Refresh discovers newly generated recognized reports.
- Existing host, port, signal, launcher, malformed-target, and cleanup tests remain green.

### Execution validation

- All sixteen Django run artifacts are nonempty and parseable.
- Baseline, staircase, and sustained metadata are `succeeded` with exit status 0.
- Overload status/exit consistency is preserved whether it succeeds or fails.
- Every displayed headline value and image identity matches source artifacts.
- The report has no external assets.
- The report index serves both committed reports and no arbitrary file.
- The full benchmark Node test suite passes.
- Django Compose has no running services after completion.

## Evidence Status

Presentation-worthy measured observations are recorded as `benchmark-observation` claims with artifact/report evidence IDs and status `needs-review`. No output is presentation-ready until speaker review.

## Approved General Failure-Aware Continuation

The preserved baseline and failed staircase artifacts under stamp `20260822T190615Z` remain immutable and are not rerun. After cleanup and stack recreation, sustained and opted-in overload are each attempted exactly once under that same stamp, in that order, using the approved stack-recreation note. A complete artifact may finalize as either `succeeded` with exit status 0 or `failed` with a nonzero exit status; a failed sustained or overload run is preserved without retry, and overload cleanup still runs.

The shared report loader normalizes metadata `notes` to a string, using an empty string only when the field is absent. General report validation accepts either finalized status for every required profile while preserving the existing status/exit-status consistency checks. The report renders per-profile notes, displaying `Not available` for empty notes.

When any profile failed, the executive summary names every failed profile and does not imply that the full suite succeeded. A prominent general failure-evidence section lists each failed profile's exit status, failed-user count, error count, and the `vusers.failed == 0` acceptance condition. This replaces overload-only warning behavior while preserving compatibility with the existing FastAPI report, whose overload profile is its only failed profile.

The final Django report is generated from all four preserved artifact sets and remains subject to complete source-to-report, standalone asset, two-report LAN index, traversal rejection, launcher cleanup, full-test, Git, and Compose-cleanliness validation. Claim recording remains controller-owned.
