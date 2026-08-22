# FastAPI Zellit Report Server Design

## Purpose

Provide a convenient package task that serves the newest generated FastAPI Zellit HTML benchmark report to browsers on the local network.

## Invocation

From `research/demo/shared/zellit/benchmark/`:

```bash
corepack pnpm report:serve
```

The task uses the repository-pinned Node.js and pnpm environment and adds no third-party dependency.

## Report Selection

The server searches `research/reports/` for regular files whose names match:

```text
fastapi-zellit-*.html
```

It selects the newest report by modification time, using the filename as a deterministic tie-breaker. If no matching report exists, startup fails with a clear error and nonzero exit status.

The selected report is resolved once at startup. Creating a newer report while the server is running does not silently switch the served document.

## Network Behavior

The default listener is:

- host: `0.0.0.0`
- port: `4173`

`REPORT_HOST` and `REPORT_PORT` override those defaults. The port must be an integer from 1 through 65535. Invalid configuration fails before listening.

At startup, the task prints:

- the selected report path;
- a localhost URL when the configured host permits local access;
- detected IPv4 LAN URLs when bound to all interfaces; and
- a warning that LAN binding exposes the report to other devices on the local network.

## HTTP Contract

The server exposes only the selected report:

- `GET /` returns the report with status 200 and `Content-Type: text/html; charset=utf-8`.
- `HEAD /` returns the same headers without a body.
- Any other path returns 404.
- Methods other than GET and HEAD return 405 with an `Allow: GET, HEAD` header.

The server does not expose directory listings, raw benchmark artifacts, arbitrary files, or other repository content. It reads the selected report for each request so an intentional in-place update is visible, while path selection remains fixed.

Read failures return 500 without exposing filesystem details to the client and are logged to stderr.

## Shutdown and Errors

Address-in-use, permission, and other listener errors are printed clearly and cause a nonzero exit. SIGINT and SIGTERM close the listener cleanly and then exit. Signal handlers remain installed while close is pending, so repeated shutdown signals are handled by the same idempotent close operation.

## Components

- `scripts/serve-report.mjs`: report discovery, configuration validation, LAN URL discovery, HTTP handler, listener startup, and signal handling.
- `test/serve-report.test.mjs`: unit and real-loopback HTTP tests.
- `package.json`: `report:serve` script invoking the Node server.

The implementation exports focused functions for discovery, configuration, and server construction so tests do not need to spawn the long-running CLI except where startup behavior itself is under test.

## Testing

Tests use temporary report directories and loopback listeners on an ephemeral port. They cover:

- newest matching regular-file selection and deterministic ties;
- ignoring unrelated files and matching directories;
- missing-report failure;
- valid defaults and host/port overrides;
- invalid ports;
- GET and HEAD response content and headers;
- 404 paths and 405 methods;
- fixed startup selection with per-request file reads;
- listener errors; and
- startup output containing the report path, URLs, and LAN exposure warning.

The complete existing benchmark Node test suite must continue to pass.

## Security Scope

This is a development/presentation convenience server, not a production server. Binding to `0.0.0.0` intentionally makes the report reachable from the LAN. Serving only one selected HTML file limits accidental repository exposure, but users remain responsible for their network and firewall configuration.

## Approved Task 2 Shutdown Amendment

Approved amendment: keep exact `corepack pnpm report:serve` / package script. For a background smoke that sends SIGTERM only to the pnpm launcher PID, accept pnpm exit 143, but Node must detect launcher/parent exit and shut itself down without an orphan. Verify foreground/process-group signal behavior separately. The prior requirement that `wait "$pid"` return 0 is superseded only for launcher-only SIGTERM.
