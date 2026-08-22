# FastAPI Zellit Benchmark Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the full FastAPI Zellit performance suite and generate a validated, standalone HTML summary from its preserved Artillery artifacts.

**Architecture:** Add one dependency-free Node module that validates and normalizes benchmark artifacts and one dependency-free Node CLI that renders normalized runs into embedded-CSS/SVG HTML. Run the existing Compose harness unchanged for baseline, staircase, sustained, and overload; feed those four immutable result directories into the CLI and validate the output against source JSON.

**Tech Stack:** Node.js 22.23.2, pnpm 11.21.0, Node test runner, Artillery 2.0.33, Docker Compose, embedded HTML/CSS/SVG.

## Global Constraints

- Run exactly one trial each of `baseline`, `staircase`, `sustained`, and opt-in `overload`; do not run or report `smoke` as performance evidence.
- Do not change benchmark profiles, application behavior, runtime settings, or the existing Compose runner.
- Use unique timestamped run IDs and never overwrite benchmark artifacts.
- Reuse the Compose stack through the first three runs; clean containers and named volumes after the final run or any failure.
- Stop after the first failed profile, preserve available artifacts, and disclose the failure without an undisclosed retry.
- Generate `research/reports/fastapi-zellit-${RUN_STAMP}.html`, where `RUN_STAMP` is captured once with `date -u +%Y%m%dT%H%M%SZ`, with embedded CSS and SVG and no external runtime dependency.
- Show missing metrics as unavailable; never infer absent values.
- Label conclusions as single-run, workload-specific benchmark observations, not framework rankings or production-capacity claims.
- The report must expose profile phases, artifact paths, Git/dataset/corpus identities, dependency versions, and runtime settings.

## File Structure

- Create `research/demo/shared/zellit/benchmark/scripts/report-data.mjs`: artifact loading, contract validation, and normalized metric calculation.
- Create `research/demo/shared/zellit/benchmark/scripts/generate-report.mjs`: HTML escaping, SVG/chart rendering, report composition, and CLI argument handling.
- Create `research/demo/shared/zellit/benchmark/test/report.test.mjs`: temporary artifact fixtures plus parser, renderer, CLI, missing-data, and external-reference tests.
- Create at execution time `research/reports/fastapi-zellit-${RUN_STAMP}.html`: generated benchmark report using the suite's single captured UTC run stamp.
- Do not modify files under `research/demo/shared/zellit/benchmark/results/`; they are runner-owned, ignored evidence artifacts.

---

### Task 1: Validate and Normalize Benchmark Artifacts

**Files:**
- Create: `research/demo/shared/zellit/benchmark/scripts/report-data.mjs`
- Create: `research/demo/shared/zellit/benchmark/test/report.test.mjs`

**Interfaces:**
- Produces: `loadRun(runDirectory: string): Promise<NormalizedRun>`.
- Produces: `NormalizedRun` with `runId`, `artifactDirectory`, `profile`, `status`, `startedAt`, `completedAt`, `implementation`, `gitRevision`, `dataset`, `requestCorpus`, `versions`, `runtime`, `phases`, and `metrics`.
- `metrics` contains nullable numbers: `requests`, `responses`, `failedVusers`, `httpErrors`, `errorRate`, `requestRate`, `p50`, `p95`, `p99`, and `max`.

- [ ] **Step 1: Write failing parser tests with complete and incomplete fixtures**

Create a fixture helper in `test/report.test.mjs` that writes all four JSON files into a temporary run directory. Use counters containing `http.requests: 100`, `http.responses: 98`, `http.codes.200: 97`, `http.codes.500: 1`, `vusers.failed: 2`; rate `http.request_rate: 25`; and response summary `{p50: 12, p95: 30, p99: 45, max: 60}`. Assert:

```js
const run = await loadRun(runDirectory)
assert.equal(run.runId, 'fastapi-zellit-baseline-20260822T120000Z')
assert.equal(run.profile, 'baseline')
assert.equal(run.metrics.requests, 100)
assert.equal(run.metrics.httpErrors, 3)
assert.equal(run.metrics.errorRate, 0.03)
assert.deepEqual(run.metrics, {
  requests: 100, responses: 98, failedVusers: 2, httpErrors: 3,
  errorRate: 0.03, requestRate: 25, p50: 12, p95: 30, p99: 45, max: 60
})
```

Here `httpErrors` is `requests - http.codes.2xx`, using the sum of all `http.codes.200` through `http.codes.299` counters; clamp only impossible negative differences to zero. Add tests asserting missing `p99` becomes `null`, malformed JSON rejects with the artifact path, a missing artifact rejects with its filename, non-`succeeded` metadata rejects, and mismatched directory/run IDs reject.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use
cd research/demo/shared/zellit/benchmark
corepack pnpm test -- --test-name-pattern='report data'
```

Expected: FAIL because `scripts/report-data.mjs` does not exist.

- [ ] **Step 3: Implement strict loading and normalization**

In `report-data.mjs`, use only `node:fs/promises` and `node:path`. Implement these exact helpers:

```js
async function readJson(runDirectory, filename)
function requiredObject(value, label)
function nullableNumber(value)
function sumSuccessfulCodes(counters)
export async function loadRun(runDirectory)
```

`readJson` must wrap read/parse failures as `Cannot read <absolute-path>: <original-message>`. `loadRun` must load `config.json`, `raw.json`, `metadata.json`, and `runtime.json`; require object roots; require `metadata.status === 'succeeded'`; require `metadata.run_id === path.basename(runDirectory)`; require `config.config.phases` to be an array; and read metrics only from `raw.aggregate`. Preserve the absolute artifact directory for traceability. Calculate `errorRate` only when `requests > 0`; otherwise set it to `null`.

- [ ] **Step 4: Run the focused and complete benchmark tests**

Run:

```bash
corepack pnpm test -- --test-name-pattern='report data'
corepack pnpm test
```

Expected: both commands PASS.

- [ ] **Step 5: Commit the normalized artifact loader**

```bash
git add research/demo/shared/zellit/benchmark/scripts/report-data.mjs \
  research/demo/shared/zellit/benchmark/test/report.test.mjs
git commit -m "feat: normalize Zellit benchmark report data"
```

---

### Task 2: Render a Standalone HTML Report

**Files:**
- Create: `research/demo/shared/zellit/benchmark/scripts/generate-report.mjs`
- Modify: `research/demo/shared/zellit/benchmark/test/report.test.mjs`

**Interfaces:**
- Consumes: `loadRun(runDirectory: string): Promise<NormalizedRun>` from Task 1.
- Produces: `renderReport(runs: NormalizedRun[], generatedAt: string): string`.
- Produces CLI: `node scripts/generate-report.mjs <output.html> <run-directory>...` requiring exactly four successful profiles: baseline, staircase, sustained, overload.

- [ ] **Step 1: Write failing renderer and CLI tests**

Extend `report.test.mjs` with four fixture runs and assertions that `renderReport`:

```js
assert.match(html, /<!doctype html>/i)
for (const profile of ['baseline', 'staircase', 'sustained', 'overload']) {
  assert.match(html, new RegExp(`data-profile="${profile}"`))
}
assert.match(html, /single trial/i)
assert.match(html, /workload-specific benchmark observation/i)
assert.match(html, /not a FastAPI-versus-Django comparison/i)
assert.match(html, /Not available/)
assert.doesNotMatch(html, /<(script|link)\b/i)
assert.doesNotMatch(html, /(?:src|href)=["']https?:/i)
```

Use a fixture value containing `<unsafe>` and assert the output contains `&lt;unsafe&gt;`. Spawn the CLI with four fixture directories and assert it creates an HTML file containing all four run IDs. Add negative CLI tests for duplicate profiles, a missing required profile, and an output path whose parent does not yet exist.

- [ ] **Step 2: Run renderer tests and confirm RED**

Run:

```bash
corepack pnpm test -- --test-name-pattern='report render|report CLI'
```

Expected: FAIL because `scripts/generate-report.mjs` does not exist.

- [ ] **Step 3: Implement report rendering and CLI**

Implement exact exported helpers:

```js
export function escapeHtml(value)
export function renderReport(runs, generatedAt)
export async function generateReport(outputPath, runDirectories)
```

Sort runs by `baseline`, `staircase`, `sustained`, `overload`. Reject duplicate or missing profiles. Create the output parent with `mkdir(..., {recursive: true})` and write UTF-8 HTML.

The document must include:

- embedded responsive CSS;
- an executive summary that reports values without declaring a winner;
- one profile card per run with requests, request rate, failed users, error count/rate, p50/p95/p99/max latency;
- an embedded SVG latency comparison with escaped labels and bars scaled against the largest available p99;
- phase tables generated from `effective_phases`/`phases`;
- shared environment, versions, runtime, dataset, corpus, and Git sections;
- absolute artifact directory paths;
- explicit caveats for one trial, differing profile loads/durations, overload intent, no Django comparison, and no production-capacity inference;
- `Not available` for every `null` metric; and
- no `<script>`, `<link>`, remote URL, or external asset reference.

- [ ] **Step 4: Run report tests and all benchmark tests**

Run:

```bash
corepack pnpm test -- --test-name-pattern='report'
corepack pnpm test
```

Expected: both commands PASS.

- [ ] **Step 5: Commit the standalone report generator**

```bash
git add research/demo/shared/zellit/benchmark/scripts/generate-report.mjs \
  research/demo/shared/zellit/benchmark/test/report.test.mjs
git commit -m "feat: generate standalone Zellit benchmark report"
```

---

### Task 3: Execute the Full FastAPI Suite and Produce the Report

**Files:**
- Create: `research/reports/fastapi-zellit-${RUN_STAMP}.html`, with `RUN_STAMP` set once in Step 1
- Read only: `research/demo/shared/zellit/benchmark/results/<run-id>/{config,raw,metadata,runtime}.json`

**Interfaces:**
- Consumes: existing `scripts/run-fastapi-compose.sh` and Task 2 CLI.
- Produces: four immutable ignored artifact directories and one tracked standalone HTML report.

- [ ] **Step 1: Verify prerequisites and establish one run timestamp**

Run from the worktree root:

```bash
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use
corepack pnpm --version
docker version
docker compose version
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
printf '%s\n' "$RUN_STAMP"
```

Expected: Node 22.23.2, pnpm 11.21.0, an available Docker server, Compose, and one nonempty UTC timestamp. Preserve `RUN_STAMP` in the same shell used for all following commands.

- [ ] **Step 2: Run baseline, staircase, and sustained against the reusable stack**

From `research/demo/shared/zellit/benchmark/`, run sequentially in one shell:

```bash
RUN_ID="fastapi-zellit-${RUN_STAMP}-baseline" CLEANUP=0 ./scripts/run-fastapi-compose.sh baseline
RUN_ID="fastapi-zellit-${RUN_STAMP}-staircase" CLEANUP=0 ./scripts/run-fastapi-compose.sh staircase
RUN_ID="fastapi-zellit-${RUN_STAMP}-sustained" CLEANUP=0 ./scripts/run-fastapi-compose.sh sustained
```

Expected: each exits 0 and prints its unique result directory. If any command fails, stop immediately and run `(cd ../../../fastapi/zellit && docker compose down -v --remove-orphans)` before reporting the failure.

- [ ] **Step 3: Run opted-in overload and clean the stack**

```bash
ENABLE_OVERLOAD=1 RUN_ID="fastapi-zellit-${RUN_STAMP}-overload" CLEANUP=1 \
  ./scripts/run-fastapi-compose.sh overload
```

Expected: exit 0 and Compose containers/volumes are removed by the runner. A nonzero Artillery exit is a benchmark failure even if caused by its ensure condition; do not retry or generate a successful four-profile report.

- [ ] **Step 4: Verify all source artifacts before reporting**

```bash
for profile in baseline staircase sustained overload; do
  dir="results/fastapi-zellit-${RUN_STAMP}-${profile}"
  for artifact in config.json raw.json metadata.json runtime.json; do
    test -s "$dir/$artifact"
    node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$dir/$artifact"
  done
  node -e 'const m=require(process.argv[1]); if(m.status!=="succeeded"||m.exit_status!==0) process.exit(1)' "$dir/metadata.json"
done
```

Expected: exit 0 with every artifact nonempty, parseable, and finalized successfully.

- [ ] **Step 5: Generate the timestamped HTML report**

From the benchmark directory:

```bash
REPORT="../../../../reports/fastapi-zellit-${RUN_STAMP}.html"
node scripts/generate-report.mjs "$REPORT" \
  "results/fastapi-zellit-${RUN_STAMP}-baseline" \
  "results/fastapi-zellit-${RUN_STAMP}-staircase" \
  "results/fastapi-zellit-${RUN_STAMP}-sustained" \
  "results/fastapi-zellit-${RUN_STAMP}-overload"
```

Expected: the CLI prints the absolute report path and exits 0.

- [ ] **Step 6: Cross-check headline values and standalone HTML constraints**

Run:

```bash
node --input-type=module - "$RUN_STAMP" "$REPORT" <<'NODE'
import {readFile} from 'node:fs/promises'
const [stamp, reportPath] = process.argv.slice(2)
const html = await readFile(reportPath, 'utf8')
if (!html.length || /<(script|link)\b/i.test(html) || /(?:src|href)=["']https?:/i.test(html)) process.exit(1)
for (const profile of ['baseline', 'staircase', 'sustained', 'overload']) {
  const id = `fastapi-zellit-${stamp}-${profile}`
  const raw = JSON.parse(await readFile(`results/${id}/raw.json`, 'utf8'))
  const requests = raw.aggregate.counters['http.requests']
  if (!html.includes(id) || !html.includes(String(requests))) process.exit(1)
}
NODE
docker compose -f ../../../fastapi/zellit/compose.yaml ps --status running --quiet | grep . && exit 1 || true
```

Expected: exit 0; all run IDs and raw request totals occur in the report, no external assets exist, and no FastAPI Zellit service remains running.

- [ ] **Step 7: Run final tests and commit only code plus HTML report**

```bash
corepack pnpm test
cd "$(git rev-parse --show-toplevel)"
git diff --check
git status --short
git add research/reports/fastapi-zellit-${RUN_STAMP}.html
git commit -m "docs: report FastAPI Zellit benchmark results"
```

Expected: tests PASS; raw result directories remain ignored; the report commit contains only the generated HTML file.

- [ ] **Step 8: Record presentation-worthy benchmark observations as needs-review**

For each headline observation actually used in the final summary, call `fastapi_claim_record` with category `benchmark-observation`, status `needs-review`, a caveat limiting it to this workload and single trial, and evidence IDs containing the four result directory IDs plus the report path. Do not mark the report presentation-ready before speaker review.
