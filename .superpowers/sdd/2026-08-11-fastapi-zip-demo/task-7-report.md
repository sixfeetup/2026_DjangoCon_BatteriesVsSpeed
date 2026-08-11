# Task 7 Report

## Status
Completed and committed as `e2b8607` (`feat: run ZIP benchmarks through Compose`).

## What changed
- Added `research/demo/shared/zip/benchmark/Dockerfile` with Node 22.23.2, pnpm 11.21.0, and frozen-lock install, including `pnpm-workspace.yaml` so supply-chain policy installs succeed in Docker.
- Added `research/demo/shared/zip/benchmark/scripts/run-compose.sh` to run the FastAPI stack from any cwd, capture git/app/runtime versions from running containers, build the benchmark image, run Artillery under the `benchmark` profile, and preserve or clean up the stack via `CLEANUP`.
- Added optional `artillery` service to `research/demo/fastapi/zip/compose.yaml` behind the `benchmark` profile with healthy-API dependency, corpus/results mounts, and metadata/override env passthrough.
- Updated `research/demo/shared/zip/benchmark/scripts/render-config.mjs` to honor `PREFIX_CORPUS_PATH` and ignore empty simple override env values.
- Updated `research/demo/shared/zip/benchmark/scripts/run.sh` to record `EXECUTION_MODE`, accept `APPLICATION_`/`FRAMEWORK_`/`SERVER_` env names, and resolve the host compose file lazily so Docker execution does not depend on repo-only paths.
- Expanded `research/demo/shared/zip/benchmark/test/benchmark.test.mjs` with RED/GREEN coverage for the Docker image, wrapper, compose service, payload override, empty-env handling, and lazy compose-file resolution.

## Verification
- `cd research/demo/shared/zip/benchmark && corepack pnpm test` ✅
- `cd research/demo/shared/zip/benchmark && CLEANUP=1 RUN_ID=docker-smoke ./scripts/run-compose.sh smoke` ✅
- Verified host-visible smoke artifacts:
  - `results/docker-smoke/raw.json` non-empty ✅
  - `results/docker-smoke/metadata.json` non-empty ✅
  - metadata assertions for `execution_mode == "docker"`, `profile == "smoke"`, and non-empty `git_revision` ✅

## Notes / concerns
- `cd research/demo/fastapi/zip && uv run pytest` is not clean in this workspace without a local Redis on `localhost:6379`; `tests/test_api.py` passed, while `tests/test_repository.py` errored with Redis connection failures. I did not change app semantics or chase that unrelated environment dependency for Task 7.

## Fix round 1
- Addressed the cleanup trap finding in `research/demo/shared/zip/benchmark/scripts/run-compose.sh` so `CLEANUP=1` preserves the original wrapper/benchmark exit status.
- Test file: `research/demo/shared/zip/benchmark/test/benchmark.test.mjs`
- RED: `bash -lc '. "${NVM_DIR:-$HOME/.nvm}/nvm.sh" && nvm use >/dev/null && cd research/demo/shared/zip/benchmark && corepack pnpm test -- --test-name-pattern "run-compose preserves the benchmark failure when cleanup also fails"'` → FAIL (`91 !== 23`).
- GREEN: same command after the trap fix → PASS.
- Verification: `bash -lc '. "${NVM_DIR:-$HOME/.nvm}/nvm.sh" && nvm use >/dev/null && cd research/demo/shared/zip/benchmark && corepack pnpm test'` → PASS (24 tests, 0 failures).
- Docker smoke: `cd research/demo/shared/zip/benchmark && CLEANUP=1 RUN_ID=docker-smoke-fix-round-1 ./scripts/run-compose.sh smoke` → PASS; artifact check (`raw.json`, `metadata.json`, metadata assertions) → `artifact-check: ok`.
- Fix commit: `1ebbd51` (`fix: preserve run-compose exit status during cleanup`).
