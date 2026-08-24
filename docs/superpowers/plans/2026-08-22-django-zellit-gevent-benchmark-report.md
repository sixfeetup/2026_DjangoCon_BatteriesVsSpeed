# Django Zellit Gevent Benchmark Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the full Django Zellit `gevent-1` suite, publish a framework-correct standalone report beside the FastAPI report, and expose both through a safe LAN report index.

**Architecture:** Generalize the existing artifact-backed HTML generator with a validated report identity derived from implementation/runtime metadata. Replace the report server’s single-file root with dynamic discovery of recognized FastAPI/Django reports, an escaped index, and verified individual report routes; then execute the unchanged Django Compose harness and render preserved artifacts.

**Tech Stack:** Node.js 22.23.2, pnpm 11.21.0, Node built-ins/tests, Artillery 2.0.33, Docker Compose, Django/Gunicorn gevent runtime.

## Global Constraints

- Run exactly one `baseline`, `staircase`, `sustained`, and opt-in `overload` trial with Django runtime preset `gevent-1`.
- Do not change benchmark profiles, application behavior, runtime settings, request corpus, dataset, or Compose runner.
- Do not retry any failed run; require baseline/staircase/sustained success and preserve a complete failed overload as labeled failure evidence.
- Output `research/reports/django-zellit-gevent-1-${RUN_STAMP}.html` with embedded CSS/SVG and no external assets.
- Preserve existing FastAPI report behavior while removing hard-coded FastAPI assumptions from shared rendering.
- Make no winner, percentage-difference, broad framework, or production-capacity claim.
- The LAN server may expose only recognized regular `fastapi-zellit-*.html` and `django-zellit-*.html` reports through its index/routes.
- Preserve no-follow descriptor validation, launcher monitoring, signal behavior, 0.0.0.0:4173 defaults, and Node-built-in-only dependencies.

## File Structure

- Modify `research/demo/shared/zellit/benchmark/scripts/generate-report.mjs`: validated framework/runtime identity and dynamic framework-specific output.
- Modify `research/demo/shared/zellit/benchmark/test/report.test.mjs`: FastAPI compatibility, Django identity, mixed-identity rejection, and image-warning tests.
- Modify `research/demo/shared/zellit/benchmark/scripts/serve-report.mjs`: recognized report listing, safe index, and verified report routes.
- Modify `research/demo/shared/zellit/benchmark/test/serve-report.test.mjs`: index, route, traversal, refresh, symlink, and lifecycle regression tests.
- Create during execution `research/reports/django-zellit-gevent-1-${RUN_STAMP}.html`.

---

### Task 1: Framework-Neutral Artifact Report Rendering

**Files:**
- Modify: `research/demo/shared/zellit/benchmark/scripts/generate-report.mjs`
- Modify: `research/demo/shared/zellit/benchmark/test/report.test.mjs`

**Interfaces:**
- Produce `deriveReportIdentity(runs: NormalizedRun[]): {frameworkName: string, implementation: string, runtimeLabel: string, title: string, heading: string, applicationImageKey: string}`.
- Preserve `renderReport(runs, generatedAt)` and `generateReport(outputPath, runDirectories)`.
- Task 3 consumes the unchanged CLI with Django artifact directories.

- [ ] **Step 1: Write failing identity tests**

Add complete Django fixtures using:

```js
implementation: 'django-zellit'
runtime: {
  runtime_label: 'gevent-1', server: 'gunicorn', workers: 1,
  concurrency_model: 'gevent', database_access: 'django-orm',
  database_driver: 'psycopg', pool_size: 20
}
versions: {python: 'Python 3.12.12', django: '5.2.11', django_ninja: '1.5.3'}
images: {django: 'sha256:django', data: 'sha256:data', artillery: 'sha256:artillery', postgresql: 'sha256:postgres'}
```

Assert `deriveReportIdentity()` returns exactly:

```js
{
  frameworkName: 'Django', implementation: 'django-zellit', runtimeLabel: 'gevent-1',
  title: 'Django Zellit gevent-1 benchmark report',
  heading: 'Django Zellit gevent-1 benchmark observations',
  applicationImageKey: 'django'
}
```

Assert existing FastAPI fixtures return the existing title/heading and `applicationImageKey: 'fastapi'`. Reject mixed implementations, mixed runtime labels, missing runtime labels, and unsupported implementations with clear errors.

- [ ] **Step 2: Confirm focused tests fail**

```bash
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use
cd research/demo/shared/zellit/benchmark
corepack pnpm test -- --test-name-pattern='report identity|Django report'
```

Expected: FAIL because dynamic identity is not implemented.

- [ ] **Step 3: Implement validated report identity**

Add a small implementation mapping for only `fastapi-zellit` and `django-zellit`. Validate every run has the same implementation and `runtime.runtime_label`. Keep FastAPI title exactly `FastAPI Zellit benchmark report` and heading exactly `FastAPI Zellit benchmark observations`; use runtime-qualified Django title/heading.

- [ ] **Step 4: Write failing dynamic-render tests**

Assert a rendered Django report contains:

- `<title>Django Zellit gevent-1 benchmark report</title>`;
- `<h1>Django Zellit gevent-1 benchmark observations</h1>`;
- Django implementation, versions, runtime, and image identity;
- no sentence saying “The FastAPI application image identity changed”; and
- the same single-trial, overload, timeout-sample, image, no-ranking, and no-capacity caveats.

Create two Django image identities and assert the warning says `The Django application image identity changed across the profiles`. Keep existing FastAPI warning assertions green. Assert mixed identity is rejected by `renderReport` and CLI generation.

- [ ] **Step 5: Replace hard-coded framework text**

Pass identity into the image warning and document template. Use `run.images[identity.applicationImageKey]`. Make the final comparison caveat framework-neutral: the standalone report does not itself establish a FastAPI-versus-Django comparison. Keep all dynamic values escaped.

- [ ] **Step 6: Run focused/full tests and commit**

```bash
corepack pnpm test -- --test-name-pattern='report'
corepack pnpm test
git diff --check
git add research/demo/shared/zellit/benchmark/scripts/generate-report.mjs \
  research/demo/shared/zellit/benchmark/test/report.test.mjs
git commit -m "feat: generalize Zellit benchmark reports"
```

Expected: all commands PASS.

---

### Task 2: Safe Multi-Report LAN Index

**Files:**
- Modify: `research/demo/shared/zellit/benchmark/scripts/serve-report.mjs`
- Modify: `research/demo/shared/zellit/benchmark/test/serve-report.test.mjs`

**Interfaces:**
- Produce `listReports(reportsDirectory: string): Promise<Array<{name: string, absolutePath: string, mtimeMs: number, label: string}>>`.
- Preserve `findLatestReport(reportsDirectory)` as a compatibility helper over `listReports`.
- Change `createReportServer(reportsDirectory, options?)` to serve a dynamic safe index and verified report routes.
- Change startup output to `Serving reports from: <absolute-directory>` while preserving URLs/warnings.

- [ ] **Step 1: Write failing recognized-list tests**

Create controlled files and assert `listReports()` recognizes only regular files matching:

```js
/^(fastapi|django)-zellit-[A-Za-z0-9][A-Za-z0-9_.-]*\.html$/
```

Include unrelated HTML, raw JSON, a matching directory, and symlink. Assert descending mtime then raw filename ordering, absolute paths, and labels:

- `fastapi-zellit-20260822T155305Z.html` → `FastAPI — 20260822T155305Z`
- `django-zellit-gevent-1-20260822T170000Z.html` → `Django — gevent-1 — 20260822T170000Z`

Return `[]` for an existing empty directory. Keep `findLatestReport()` returning the first path and rejecting empty lists with a framework-neutral message.

- [ ] **Step 2: Confirm list tests fail, then implement listing**

```bash
corepack pnpm exec node --test --test-name-pattern='report list|latest report' test/serve-report.test.mjs
```

Use `readdir` plus `lstat`, deterministic sorting, and escaped-at-render labels. Do not follow symlinks.

- [ ] **Step 3: Write failing index/route tests**

Using a real loopback server and temporary report directory, assert:

- GET `/` returns a standalone escaped HTML index with both reports and URL-encoded links;
- HEAD `/` has matching headers and no body;
- empty recognized set returns a 200 index with `No Zellit reports are available yet`;
- GET/HEAD `/reports/<encoded-filename>` serves exact report bytes/content type;
- a newly created recognized report appears after index refresh;
- unrelated HTML, raw JSON, missing files, directories, and symlinks return 404/500 without content disclosure;
- `../`, `%2e%2e`, `%2f`, `%5c`, malformed `%` encoding, extra segments, queries, and fragments cannot escape or select files;
- unsupported methods return 405 with `Allow: GET, HEAD`;
- replacing an allowed report with a symlink to a secret never exposes the secret.

- [ ] **Step 4: Implement safe index and report routes**

Parse request targets without uncaught URL errors. Accept exactly `/` or `/?` for index and exactly one encoded filename segment under `/reports/` with no query. Decode in try/catch; reject separators, dot segments, NUL, malformed encoding, and pattern misses. Resolve under the configured reports directory and verify basename/parent invariants.

Use the existing secure descriptor read helper for reports, including no-follow, fstat/lstat regular-file and inode/device checks. Render index HTML with escaped text and `encodeURIComponent(name)` links. Add no-store/nosniff headers.

- [ ] **Step 5: Adapt startup/main without weakening lifecycle behavior**

`main()` passes the reports directory to the server, starts even when no reports exist, and prints the directory plus URLs/warning. Preserve synchronous launcher capture, Linux ancestry fallback, parent monitoring, signal idempotence, and post-listen cleanup unchanged except for required parameter names.

- [ ] **Step 6: Run focused/full tests and lifecycle smoke**

```bash
corepack pnpm exec node --test test/serve-report.test.mjs
corepack pnpm test
git diff --check
```

Then start `corepack pnpm report:serve` on 4174, assert `/` lists the committed FastAPI report, fetch its encoded report URL, reject `/reports/../NOTES.md`, send SIGTERM only to the launcher, accept 143, and condition-poll until Node/listener disappear.

- [ ] **Step 7: Commit Task 2**

```bash
git add research/demo/shared/zellit/benchmark/scripts/serve-report.mjs \
  research/demo/shared/zellit/benchmark/test/serve-report.test.mjs
git commit -m "feat: index Zellit benchmark reports"
```

---

### Task 3: Execute Django Gevent Suite and Publish Report

**Files:**
- Create: `research/reports/django-zellit-gevent-1-${RUN_STAMP}.html`
- Read only: the four `research/demo/shared/zellit/benchmark/results/django-zellit-gevent-1-${RUN_STAMP}-${PROFILE}/*.json` directories, where `PROFILE` is each required profile name

**Interfaces:**
- Consume `scripts/run-compose.sh`, generalized `generate-report.mjs`, and indexed `report:serve`.
- Produce four immutable ignored artifact directories and one tracked HTML report.

- [ ] **Step 1: Establish prerequisites and one UTC stamp**

From the worktree root, load `.nvmrc`, verify Node 22.23.2, pnpm 11.21.0, Docker/Compose availability, and capture once:

```bash
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
```

Keep the same shell/stamp through all commands.

- [ ] **Step 2: Run baseline, staircase, and sustained sequentially**

From `research/demo/shared/zellit/benchmark/`:

```bash
RUN_ID="django-zellit-gevent-1-${RUN_STAMP}-baseline" CLEANUP=0 ./scripts/run-compose.sh baseline gevent-1
RUN_ID="django-zellit-gevent-1-${RUN_STAMP}-staircase" CLEANUP=0 ./scripts/run-compose.sh staircase gevent-1
RUN_ID="django-zellit-gevent-1-${RUN_STAMP}-sustained" CLEANUP=0 ./scripts/run-compose.sh sustained gevent-1
```

Stop immediately on nonzero status, preserve artifacts, run Django Compose cleanup, and report BLOCKED without retry.

- [ ] **Step 3: Run opted-in overload and clean**

```bash
ENABLE_OVERLOAD=1 RUN_ID="django-zellit-gevent-1-${RUN_STAMP}-overload" CLEANUP=1 \
  ./scripts/run-compose.sh overload gevent-1
```

If overload exits nonzero only because its acceptance condition failed, preserve the complete failed artifact and continue under the approved failure-aware report protocol. Do not retry. Confirm Django Compose has no running services.

- [ ] **Step 4: Validate all source artifacts**

For all four directories, require nonempty parseable `config.json`, `raw.json`, `metadata.json`, and `runtime.json`; matching run IDs/profiles; implementation `django-zellit`; runtime label `gevent-1`; identical dataset/corpus identities; baseline/staircase/sustained `succeeded/0`; and overload either `succeeded/0` or `failed/nonzero`.

Record whether Git revisions, versions, and image identities remain stable. Do not hide differences.

- [ ] **Step 5: Generate the Django report from preserved artifacts**

From the benchmark directory:

```bash
REPORT="../../../../reports/django-zellit-gevent-1-${RUN_STAMP}.html"
node scripts/generate-report.mjs "$REPORT" \
  "results/django-zellit-gevent-1-${RUN_STAMP}-baseline" \
  "results/django-zellit-gevent-1-${RUN_STAMP}-staircase" \
  "results/django-zellit-gevent-1-${RUN_STAMP}-sustained" \
  "results/django-zellit-gevent-1-${RUN_STAMP}-overload"
```

- [ ] **Step 6: Cross-check report and index**

Parse source artifacts and verify the report contains every run ID, status/exit code, requests, responses, failed users, latency sample count, p50/p95/p99/max, phases, Django/gevent identity, versions, runtime, dataset/corpus/Git, image IDs, and required caveats. Require no script/link tags or remote src/href.

Start `report:serve` on 4174 and verify `/` lists both the FastAPI and Django report filenames, both encoded links return their expected titles, traversal/unrelated file requests fail, launcher-only SIGTERM leaves no process/listener, and no Compose services remain.

- [ ] **Step 7: Run final tests and commit only the report**

```bash
corepack pnpm test
cd "$(git rev-parse --show-toplevel)"
git diff --check
git add "research/reports/django-zellit-gevent-1-${RUN_STAMP}.html"
git commit -m "docs: report Django Zellit gevent benchmarks"
```

Raw result directories stay ignored. The commit contains only the generated Django HTML report.

- [ ] **Step 8: Record benchmark claims**

For presentation-worthy observations, use category `benchmark-observation`, status `needs-review`, complete workload/single-trial/image/timeout caveats, and evidence IDs containing the Django run IDs plus report path. Do not create percentage comparisons or presentation-ready wording.

## Approved General Failure-Aware Continuation

This amendment supersedes Task 3's mandatory-success and stop-on-non-overload-failure rules for the preserved stamp `20260822T190615Z` only.

- [ ] Preserve the existing baseline and failed staircase artifacts unchanged; do not rerun either profile.
- [ ] Use strict TDD to normalize metadata `notes`, permit `succeeded/0` or `failed/nonzero` for every finalized profile, render notes with `Not available` for empty values, and replace the overload-only warning with a prominent all-failed-profile evidence section.
- [ ] Ensure the executive summary names every failed profile without winner or full-suite-success language. Cover failed staircase plus failed overload, failed sustained acceptance, successful profiles, notes, and existing FastAPI overload compatibility in tests.
- [ ] Commit the implementation, tests, and this design/plan amendment before executing another benchmark, with commit message `feat: report failed Zellit profile evidence`.
- [ ] Recreate the clean Django stack as part of the unchanged runner and run sustained exactly once as `django-zellit-gevent-1-20260822T190615Z-sustained`, with `CLEANUP=0` and `BENCHMARK_NOTES="Stack recreated after the staircase acceptance failure and protocol pause; this profile did not share the original live Compose stack."`.
- [ ] Regardless of sustained's final status, run overload exactly once as `django-zellit-gevent-1-20260822T190615Z-overload`, with the same note, `ENABLE_OVERLOAD=1`, and `CLEANUP=1`. Preserve complete nonzero results without retry.
- [ ] Validate all four artifact sets and generate `research/reports/django-zellit-gevent-1-20260822T190615Z.html`; cross-check statuses, exits, metrics, latency sample counts, phases, versions, runtime, dataset/corpus/Git identities, image identities, notes, and caveats, and require no external assets.
- [ ] Verify the LAN index lists and serves both FastAPI and Django reports, traversal fails, launcher-only termination cleans processes/listeners, full tests pass, tracked Git is clean, and Django Compose is clean.
- [ ] Commit only the generated report with `docs: report Django Zellit gevent benchmarks`.
- [ ] Record candidate observations and evidence IDs for controller review, but do not invoke or claim ownership of the Step 8 claim tool.
