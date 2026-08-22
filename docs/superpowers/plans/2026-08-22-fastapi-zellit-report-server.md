# FastAPI Zellit Report Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `corepack pnpm report:serve` to serve the newest FastAPI Zellit HTML report safely over the LAN on port 4173.

**Architecture:** A dependency-free Node module discovers one report, validates listener configuration, and creates an HTTP server that exposes only that report. A thin CLI binds the server, prints local/LAN URLs and a security warning, handles startup errors, and closes cleanly on signals.

**Tech Stack:** Node.js 22.23.2, pnpm 11.21.0, Node `http`, `fs`, `os`, and `node:test`; no new packages.

## Global Constraints

- Default host is exactly `0.0.0.0`; default port is exactly `4173`.
- `REPORT_HOST` and `REPORT_PORT` may override defaults; port must be an integer from 1 through 65535.
- Select the newest regular file matching `fastapi-zellit-*.html` under `research/reports/`, with filename as deterministic tie-breaker.
- Select once at startup, but read the selected file for every request.
- Expose only `GET /` and `HEAD /`; return 404 for other paths and 405 plus `Allow: GET, HEAD` for other methods.
- Never expose directory listings, arbitrary files, raw artifacts, or filesystem details in HTTP error bodies.
- Print selected path, usable local/LAN URLs, and a LAN exposure warning.
- Handle listener errors and SIGINT/SIGTERM cleanly.
- Add no dependency and preserve all existing benchmark/report behavior.

## File Structure

- Create `research/demo/shared/zellit/benchmark/scripts/serve-report.mjs`: discovery, configuration, handler/server construction, URL formatting, CLI startup, and shutdown.
- Create `research/demo/shared/zellit/benchmark/test/serve-report.test.mjs`: temporary-filesystem, HTTP, startup-message, error, and shutdown tests.
- Modify `research/demo/shared/zellit/benchmark/package.json`: add the `report:serve` script.

---

### Task 1: Report Discovery, Configuration, and HTTP Contract

**Files:**
- Create: `research/demo/shared/zellit/benchmark/scripts/serve-report.mjs`
- Create: `research/demo/shared/zellit/benchmark/test/serve-report.test.mjs`

**Interfaces:**
- Produces `findLatestReport(reportsDirectory: string): Promise<string>` returning an absolute path.
- Produces `resolveServerConfig(env?: object): {host: string, port: number}`.
- Produces `createReportServer(reportPath: string, options?: {logger?: object}): http.Server`.
- Later Task 2 consumes all three interfaces.

- [ ] **Step 1: Write failing discovery and configuration tests**

Create temporary report files with controlled `utimes`. Assert that discovery ignores unrelated names and matching directories, selects greatest modification time, and resolves equal-time ties by lexicographically greatest filename. Assert the returned path is absolute. Assert an empty directory rejects with `No FastAPI Zellit HTML reports found in <absolute-directory>`.

Assert:

```js
assert.deepEqual(resolveServerConfig({}), {host: '0.0.0.0', port: 4173})
assert.deepEqual(resolveServerConfig({REPORT_HOST: '127.0.0.1', REPORT_PORT: '9000'}), {
  host: '127.0.0.1', port: 9000
})
for (const value of ['', '0', '65536', '1.5', 'abc', ' 4173']) {
  assert.throws(() => resolveServerConfig({REPORT_PORT: value}), /REPORT_PORT/)
}
```

Treat an explicitly empty `REPORT_HOST` as invalid rather than silently restoring the default.

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use
cd research/demo/shared/zellit/benchmark
corepack pnpm exec node --test test/serve-report.test.mjs
```

Expected: FAIL because `scripts/serve-report.mjs` does not exist.

- [ ] **Step 3: Implement discovery and configuration**

Use `readdir(..., {withFileTypes: true})`, `stat`, `path.resolve`, and this exact filename match:

```js
/^fastapi-zellit-.*\.html$/
```

Sort candidates by descending `mtimeMs`, then descending filename. Validate configuration without numeric coercion surprises: `REPORT_PORT` must match `/^[0-9]+$/`, parse to a safe integer, and fall in `[1, 65535]`.

- [ ] **Step 4: Write failing real-HTTP contract tests**

Create a server with a temporary report, listen on `127.0.0.1` port `0` inside the test, and use Node `fetch` to assert:

- GET `/` returns exact file contents and `text/html; charset=utf-8`;
- HEAD `/` returns the same status/content type and an empty body;
- GET `/raw.json` and `/?path=other` return 404;
- POST `/` returns 405 and `Allow: GET, HEAD`;
- replacing the selected file in place changes the next GET response;
- deleting the selected file returns generic 500 text without its path and logs the detailed read failure.

Always close the server in test cleanup.

- [ ] **Step 5: Implement the HTTP server**

Use `http.createServer`. Parse request paths with `new URL(request.url, 'http://localhost').pathname`, but require the original URL to be exactly `/` or an empty query on `/`; `/?path=other` must remain 404. Set `Content-Type`, `Content-Length`, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff` for success. For HEAD, read the file to establish current length but send no body. Use plain generic bodies for 404, 405, and 500.

- [ ] **Step 6: Run focused and complete tests**

```bash
corepack pnpm exec node --test test/serve-report.test.mjs
corepack pnpm test
```

Expected: both PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add research/demo/shared/zellit/benchmark/scripts/serve-report.mjs \
  research/demo/shared/zellit/benchmark/test/serve-report.test.mjs
git commit -m "feat: add Zellit report HTTP server"
```

---

### Task 2: LAN Startup Task, URLs, Errors, and Shutdown

**Files:**
- Modify: `research/demo/shared/zellit/benchmark/scripts/serve-report.mjs`
- Modify: `research/demo/shared/zellit/benchmark/test/serve-report.test.mjs`
- Modify: `research/demo/shared/zellit/benchmark/package.json`

**Interfaces:**
- Consumes Task 1’s `findLatestReport`, `resolveServerConfig`, and `createReportServer`.
- Produces `buildStartupLines({reportPath, host, port, networkInterfaces?}): string[]`.
- Produces `listen(server, {host, port}): Promise<void>` that rejects listener errors.
- Produces `installShutdownHandlers(server, processLike?): () => void`, returning cleanup.
- Produces `main({reportsDirectory?, env?, stdout?, stderr?, processLike?} = {}): Promise<http.Server | null>` for testable startup.
- Produces CLI task `corepack pnpm report:serve`.

- [ ] **Step 1: Write failing startup-message tests**

Assert all-interface startup lines include:

```text
Serving report: <absolute path>
Local: http://localhost:4173/
LAN: http://192.168.1.20:4173/
Warning: this report is exposed to devices on your local network.
```

Provide a fake `networkInterfaces` object with internal, external IPv4, IPv6, and duplicate entries; include each unique external IPv4 exactly once in sorted order. For host `127.0.0.1`, print only `http://127.0.0.1:4173/` and do not print a LAN warning. For a specific non-loopback host, print that host URL and the warning.

- [ ] **Step 2: Write failing listener and shutdown tests**

Occupy an ephemeral loopback port with one server and assert `listen` rejects when a second server uses it. Use a fake process-like EventEmitter and fake server to assert the first SIGINT/SIGTERM calls `server.close`, successful close exits with code 0 through an injected `exit` function, and returned cleanup removes handlers. Keep process behavior injectable so tests never exit the runner.

- [ ] **Step 3: Implement messages, listener, and shutdown**

Use `os.networkInterfaces()` by default. Bracket IPv6 configured hosts when formatting URLs, but LAN auto-discovery remains external IPv4 only. `listen` must subscribe with one-time `listening`/`error` handlers and remove the opposite handler after settlement. Shutdown must be idempotent and report close errors to stderr before nonzero exit.

- [ ] **Step 4: Add package task and CLI main**

Add to `package.json` scripts:

```json
"report:serve": "node scripts/serve-report.mjs"
```

When `serve-report.mjs` is executed directly:

1. Resolve repository root from the script path and use `<root>/research/reports`.
2. Discover the report and validate config before creating the listener.
3. Listen, then print every startup line.
4. Install shutdown handlers only after successful listen.
5. On startup failure, print `Could not start report server: <message>` to stderr and set exit code 1.

- [ ] **Step 5: Add package and startup integration tests**

Assert `package.json` contains the exact task. Test `main({reportsDirectory, env, stdout, stderr, processLike})` directly with dependency injection. Verify missing reports produce one clear stderr error and set `processLike.exitCode` to 1, while successful startup returns its server and emits report path, URL, and warning. Close the returned listener in test cleanup.

- [ ] **Step 6: Run all verification**

```bash
corepack pnpm exec node --test test/serve-report.test.mjs
corepack pnpm test
git diff --check
```

Expected: focused and full tests PASS; diff check is clean.

- [ ] **Step 7: Commit Task 2**

```bash
git add research/demo/shared/zellit/benchmark/package.json \
  research/demo/shared/zellit/benchmark/scripts/serve-report.mjs \
  research/demo/shared/zellit/benchmark/test/serve-report.test.mjs
git commit -m "feat: serve Zellit reports over LAN"
```

- [ ] **Step 8: Manual smoke test on loopback and LAN binding**

Start in the background with a temporary explicit port, wait until the startup URL appears, fetch `/`, verify the generated report title, verify `/raw.json` is 404, send SIGTERM, and confirm the process exits:

```bash
REPORT_PORT=4174 corepack pnpm report:serve > /tmp/zellit-report-server.log 2>&1 &
pid=$!
for attempt in $(seq 1 50); do grep -q 'Local:' /tmp/zellit-report-server.log && break; sleep 0.1; done
curl --fail http://127.0.0.1:4174/ | grep -q '<title>FastAPI Zellit benchmark report</title>'
test "$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:4174/raw.json)" = 404
kill -TERM "$pid"
wait "$pid"
```

Expected: all commands exit 0 and startup log includes the selected report path plus the LAN exposure warning.
