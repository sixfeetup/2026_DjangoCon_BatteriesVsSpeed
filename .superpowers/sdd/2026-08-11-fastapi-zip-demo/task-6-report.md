# Task 6 Report

Status: committed

Commit:
- 568b793 feat: add shared ZIP Artillery profiles

Implemented:
- Added pinned pnpm/Artillery benchmark package at `research/demo/shared/zip/benchmark`
- Added committed shared profiles, renderer, strict response validator, metadata writer, host run script, and Node tests
- Added local ignores for `node_modules/` and benchmark `results/`
- Added pnpm 11 build-approval file for reproducible host runs without committing local installs

Verification performed:
- `cd research/demo/shared/zip/benchmark && corepack pnpm test`
  - PASS: 15/15 tests
- Host smoke against Compose FastAPI stack:
  - `docker compose -f research/demo/fastapi/zip/compose.yaml up --build --wait api`
  - `cd research/demo/shared/zip/benchmark && RUN_ID=host-smoke corepack pnpm benchmark -- smoke http://localhost:8000`
  - PASS: 10 HTTP 200 responses, no `zip.invalid_response` counter, `results/host-smoke/raw.json` and `metadata.json` written
- Redis-backed Python suites with required Redis service running:
  - `cd research/demo/fastapi/zip && docker compose up -d --wait redis`
  - `cd research/demo/shared/zip && uv run pytest`
  - `cd research/demo/fastapi/zip && uv run pytest`
  - PASS: shared zip 7/7, fastapi zip 20/20

Self-review notes:
- `run.sh` now accepts pnpm script forwarding (`--`) and rejects overload without `ENABLE_OVERLOAD=1`
- Metadata collection now parses Artillery version to `2.0.33`, probes app/framework/server versions through `uv run --frozen`, and fails on suspicious multiline/traceback values rather than writing incomplete metadata
- `pnpm-workspace.yaml` is committed because pnpm 11.21.0 requires explicit build approvals for transitive Artillery dependencies; values are set to `false` to avoid unnecessary install-time downloads

Concerns:
- None for Task 6 scope; broader Python suites require Redis availability when run outside Compose, which was satisfied during final verification

## Fix round 1

Status: committed

Important finding addressed verbatim:
- Missing cleanup trap in `research/demo/shared/zip/benchmark/scripts/run.sh`. If the shell is interrupted after the initial metadata write and before the final write, `metadata.json` can be left incomplete. The script handles ordinary nonzero Artillery exits, but not shell-level interruption/termination.

Files changed:
- `research/demo/shared/zip/benchmark/scripts/run.sh`
- `research/demo/shared/zip/benchmark/test/benchmark.test.mjs`

Covering test file:
- `research/demo/shared/zip/benchmark/test/benchmark.test.mjs`
  - `run script finalizes metadata and preserves signal status on SIGTERM`

RED:
- Command:
  - `source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" && nvm use && cd /home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/research/demo/shared/zip/benchmark && corepack pnpm exec node --test --test-name-pattern 'run script finalizes metadata and preserves signal status on SIGTERM' test/benchmark.test.mjs`
- Exact output:
```text
Found '/home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/.nvmrc' with version <22.23.2>
Now using node v22.23.2 (npm v10.9.8)
TAP version 13
# Subtest: run script finalizes metadata and preserves signal status on SIGTERM
not ok 1 - run script finalizes metadata and preserves signal status on SIGTERM
  ---
  duration_ms: 108.168687
  type: 'test'
  location: '/home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/research/demo/shared/zip/benchmark/test/benchmark.test.mjs:201:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
    +   code: null,
    +   signal: 'SIGTERM'
    -   code: 143,
    -   signal: null
      }
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    code: 143
    signal: ~
  actual:
    code: ~
    signal: 'SIGTERM'
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (file:///home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/research/demo/shared/zip/benchmark/test/benchmark.test.mjs:266:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
  ...
1..1
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 257.560407
```

GREEN:
- Command:
  - `source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" && nvm use && cd /home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/research/demo/shared/zip/benchmark && corepack pnpm exec node --test --test-name-pattern 'run script finalizes metadata and preserves signal status on SIGTERM' test/benchmark.test.mjs`
- Exact output:
```text
Found '/home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/.nvmrc' with version <22.23.2>
Now using node v22.23.2 (npm v10.9.8)
TAP version 13
# Subtest: run script finalizes metadata and preserves signal status on SIGTERM
ok 1 - run script finalizes metadata and preserves signal status on SIGTERM
  ---
  duration_ms: 239.731586
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 271.519591
```

Full verification:
- `source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" && nvm use && cd /home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/research/demo/shared/zip/benchmark && corepack pnpm test`
  - PASS: 16/16 tests
- Host smoke against Compose FastAPI stack:
  - `source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" && nvm use && cd /home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/research/demo/fastapi/zip && docker compose up --build --wait api && cd ../../shared/zip/benchmark && RUN_ID=host-smoke-fix-round1 corepack pnpm benchmark -- smoke http://localhost:8000 && test -s results/host-smoke-fix-round1/raw.json && test -s results/host-smoke-fix-round1/metadata.json && cd ../../../fastapi/zip && docker compose down -v --remove-orphans`
  - PASS: 10 HTTP 200 responses; finalized metadata included `"completed_at": "2026-08-11T13:41:12.449Z"`

Commit:
- `c33d616 fix: finalize benchmark metadata on interruption`

Deferred:
- The reviewer’s Minor request for broader callback and shell failure coverage remains deferred outside this fix; the added test is limited to SIGTERM finalization/status preservation.

## Fix round 2

Status: committed

Important finding addressed verbatim:
- NOT ADDRESSED: `run.sh` installs cleanup traps after the initial `write_metadata ""`, so SIGTERM/SIGINT in that window can still leave `completed_at` unset. The new test only covers interruption after traps are active.

Files changed:
- `research/demo/shared/zip/benchmark/scripts/run.sh`
- `research/demo/shared/zip/benchmark/test/benchmark.test.mjs`

Covering test file:
- `research/demo/shared/zip/benchmark/test/benchmark.test.mjs`
  - `run script finalizes metadata when SIGTERM lands during the initial metadata write`

RED:
- Command:
  - `source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" && nvm use && cd /home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/research/demo/shared/zip/benchmark && corepack pnpm exec node --test --test-name-pattern 'run script finalizes metadata when SIGTERM lands during the initial metadata write' test/benchmark.test.mjs`
- Exact output:
```text
Found '/home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/.nvmrc' with version <22.23.2>
Now using node v22.23.2 (npm v10.9.8)
✓ Lockfile passes supply-chain policies (verified 30m ago)
Lockfile is up to date, resolution step is skipped
Already up to date

Done in 366ms using pnpm v11.21.0
TAP version 13
# Subtest: run script finalizes metadata when SIGTERM lands during the initial metadata write
not ok 1 - run script finalizes metadata when SIGTERM lands during the initial metadata write
  ---
  duration_ms: 108.672172
  type: 'test'
  location: '/home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/research/demo/shared/zip/benchmark/test/benchmark.test.mjs:215:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
    +   code: null,
    +   signal: 'SIGTERM'
    -   code: 143,
    -   signal: null
      }
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    code: 143
    signal: ~
  actual:
    code: ~
    signal: 'SIGTERM'
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (file:///home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/research/demo/shared/zip/benchmark/test/benchmark.test.mjs:281:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
  ...
1..1
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 143.298116


Command exited with code 1
```

GREEN:
- Command:
  - `source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" && nvm use && cd /home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/research/demo/shared/zip/benchmark && corepack pnpm exec node --test --test-name-pattern 'run script finalizes metadata when SIGTERM lands during the initial metadata write' test/benchmark.test.mjs`
- Exact output:
```text
Found '/home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/.nvmrc' with version <22.23.2>
Now using node v22.23.2 (npm v10.9.8)
TAP version 13
# Subtest: run script finalizes metadata when SIGTERM lands during the initial metadata write
ok 1 - run script finalizes metadata when SIGTERM lands during the initial metadata write
  ---
  duration_ms: 142.131091
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 174.874624
```

Full verification:
- `source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" && nvm use && cd /home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/research/demo/shared/zip/benchmark && corepack pnpm test`
- Exact output:
```text
Found '/home/calvin/Documents/Work/2026_DjangoCon_BatteriesVsSpeed/.worktrees/fastapi-zip-demo/.nvmrc' with version <22.23.2>
Now using node v22.23.2 (npm v10.9.8)
$ node --test test/*.test.mjs
TAP version 13
# Subtest: staircase renders committed rates
ok 1 - staircase renders committed rates
  ---
  duration_ms: 3.599923
  type: 'test'
  ...
# Subtest: environment overrides sustained rate and duration
ok 2 - environment overrides sustained rate and duration
  ---
  duration_ms: 0.479752
  type: 'test'
  ...
# Subtest: staircase override replaces measured rates but retains warm-up
ok 3 - staircase override replaces measured rates but retains warm-up
  ---
  duration_ms: 0.38296
  type: 'test'
  ...
# Subtest: all committed profiles render
ok 4 - all committed profiles render
  ---
  duration_ms: 0.892679
  type: 'test'
  ...
# Subtest: unknown profiles are rejected
ok 5 - unknown profiles are rejected
  ---
  duration_ms: 0.618995
  type: 'test'
  ...
# Subtest: non-http targets are rejected
ok 6 - non-http targets are rejected
  ---
  duration_ms: 0.137108
  type: 'test'
  ...
# Subtest: response validator accepts exact payload contract
ok 7 - response validator accepts exact payload contract
  ---
  duration_ms: 0.333768
  type: 'test'
  ...
# Subtest: response validator rejects wrong payload length
ok 8 - response validator rejects wrong payload length
  ---
  duration_ms: 0.074029
  type: 'test'
  ...
# Subtest: response validator rejects unexpected object shapes
ok 9 - response validator rejects unexpected object shapes
  ---
  duration_ms: 0.182734
  type: 'test'
  ...
# Subtest: profiles fixture contains all committed profiles
ok 10 - profiles fixture contains all committed profiles
  ---
  duration_ms: 1.399212
  type: 'test'
  ...
# Subtest: writeMetadata writes ordered metadata json
ok 11 - writeMetadata writes ordered metadata json
  ---
  duration_ms: 1.17419
  type: 'test'
  ...
# Subtest: writeMetadata rejects incomplete metadata
ok 12 - writeMetadata rejects incomplete metadata
  ---
  duration_ms: 0.293011
  type: 'test'
  ...
# Subtest: run script requires profile and target arguments
ok 13 - run script requires profile and target arguments
  ---
  duration_ms: 3.10457
  type: 'test'
  ...
# Subtest: run script rejects overload without opt-in
ok 14 - run script rejects overload without opt-in
  ---
  duration_ms: 2.994294
  type: 'test'
  ...
# Subtest: run script accepts pnpm-style leading double-dash
ok 15 - run script accepts pnpm-style leading double-dash
  ---
  duration_ms: 2.233032
  type: 'test'
  ...
# Subtest: run script finalizes metadata when SIGTERM lands during the initial metadata write
ok 16 - run script finalizes metadata when SIGTERM lands during the initial metadata write
  ---
  duration_ms: 139.195128
  type: 'test'
  ...
1..16
# tests 16
# suites 0
# pass 16
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 191.053181
```

Commit:
- `fix: arm benchmark finalizer before initial metadata write`

Notes:
- `run.sh` now arms EXIT/HUP/INT/TERM trapping before the first metadata write and only finalizes when metadata state is fully initialized, so an interruption in that window rewrites complete metadata instead of skipping `completed_at`.
