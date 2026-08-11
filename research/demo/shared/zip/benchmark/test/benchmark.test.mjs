import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { buildConfig } from '../scripts/render-config.mjs'
import processor from '../processor.cjs'
import { writeMetadata } from '../scripts/write-metadata.mjs'

const execFileAsync = promisify(execFile)
const benchmarkDir = new URL('..', import.meta.url)
const benchmarkPath = fileURLToPath(benchmarkDir)
const metadataKeys = [
  'run_id',
  'started_at',
  'completed_at',
  'git_revision',
  'target',
  'profile',
  'node_version',
  'artillery_version',
  'python_version',
  'application_version',
  'framework_version',
  'server_version',
  'redis_version',
  'effective_phases',
  'execution_mode'
]

async function waitForJson(filePath, predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8'))
      if (predicate(parsed)) {
        return parsed
      }
    } catch {
      // Keep polling until the file is fully written.
    }

    await delay(50)
  }

  throw new Error(`Timed out waiting for ${filePath}`)
}

async function waitForExit(child, timeoutMs = 5_000) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for process ${child.pid} to exit`))
    }, timeoutMs)

    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({code, signal})
    })
  })
}

test('staircase renders committed rates', async () => {
  const config = await buildConfig('staircase', 'http://api:8000', {})
  assert.deepEqual(config.config.phases.map((phase) => phase.arrivalRate), [10, 25, 50, 100, 200, 400, 800])
  assert.equal(config.scenarios[0].flow[0].get.url, '/zip-codes?q={{ q }}')
})

test('environment overrides sustained rate and duration', async () => {
  const config = await buildConfig('sustained', 'http://localhost:8000', {
    SUSTAINED_RATE: '350',
    SUSTAINED_DURATION: '120'
  })
  assert.deepEqual(config.config.phases, [{duration: 120, arrivalRate: 350}])
})

test('staircase override replaces measured rates but retains warm-up', async () => {
  const config = await buildConfig('staircase', 'http://localhost:8000', {
    STAIRCASE_RATES: '30,60,120,240,480,960'
  })
  assert.deepEqual(config.config.phases.map((phase) => phase.arrivalRate), [10, 30, 60, 120, 240, 480, 960])
})

test('all committed profiles render', async () => {
  for (const profile of ['smoke', 'baseline', 'staircase', 'sustained', 'overload']) {
    const config = await buildConfig(profile, 'http://localhost:8000', {})
    assert.ok(config.config.phases.length > 0)
  }
})

test('unknown profiles are rejected', async () => {
  await assert.rejects(() => buildConfig('unknown', 'http://localhost:8000', {}), /Unknown profile/)
})

test('non-http targets are rejected', async () => {
  await assert.rejects(() => buildConfig('smoke', 'redis://localhost:6379', {}), /HTTP\(S\) target/)
})

test('response validator accepts exact payload contract', () => {
  const body = JSON.stringify(Array.from({length: 10}, (_, index) => ({
    zip: String(10000 + index),
    city: `City ${index}`
  })))
  assert.doesNotThrow(() => processor.assertZipResponse({}, {statusCode: 200, body}))
})

test('response validator rejects wrong payload length', () => {
  assert.throws(() => processor.assertZipResponse({}, {statusCode: 200, body: '[]'}), /10 records/)
})

test('response validator rejects unexpected object shapes', () => {
  const invalidBody = JSON.stringify(Array.from({length: 10}, () => ({zip: '12345', city: 'Town', state: 'IN'})))
  assert.throws(() => processor.assertZipResponse({}, {statusCode: 200, body: invalidBody}), /only zip and city/)
})

test('profiles fixture contains all committed profiles', async () => {
  const profiles = JSON.parse(await readFile(new URL('../profiles.json', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(profiles), ['smoke', 'baseline', 'staircase', 'sustained', 'overload'])
})

test('writeMetadata writes ordered metadata json', async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'zip-benchmark-'))
  const outputPath = path.join(outputDir, 'metadata.json')
  const metadata = {
    run_id: 'host-smoke',
    started_at: '2026-08-11T12:00:00.000Z',
    completed_at: '2026-08-11T12:00:10.000Z',
    git_revision: 'abc123',
    target: 'http://localhost:8000',
    profile: 'smoke',
    node_version: 'v22.23.2',
    artillery_version: '2.0.33',
    python_version: 'Python 3.14.4',
    application_version: '0.1.0',
    framework_version: '0.141.0',
    server_version: '0.35.0',
    redis_version: 'Redis server v=8.2.2',
    effective_phases: [{duration: 10, arrivalRate: 1}],
    execution_mode: 'host'
  }

  await writeMetadata(outputPath, metadata)

  const written = JSON.parse(await readFile(outputPath, 'utf8'))
  assert.deepEqual(Object.keys(written), metadataKeys)
  assert.equal(written.execution_mode, 'host')
})

test('writeMetadata rejects incomplete metadata', async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'zip-benchmark-'))
  const outputPath = path.join(outputDir, 'metadata.json')
  await assert.rejects(
    () => writeMetadata(outputPath, {
      run_id: 'host-smoke'
    }),
    /Missing metadata field/
  )
})

test('run script requires profile and target arguments', async () => {
  await assert.rejects(
    () => execFileAsync('bash', ['scripts/run.sh'], {cwd: benchmarkDir}),
    (error) => {
      assert.equal(error.code, 1)
      assert.match(error.stderr, /Usage:/)
      return true
    }
  )
})

test('run script rejects overload without opt-in', async () => {
  await assert.rejects(
    () => execFileAsync('bash', ['scripts/run.sh', 'overload', 'http://localhost:8000'], {cwd: benchmarkDir}),
    (error) => {
      assert.equal(error.code, 1)
      assert.match(error.stderr, /ENABLE_OVERLOAD=1/)
      return true
    }
  )
})

test('run script accepts pnpm-style leading double-dash', async () => {
  await assert.rejects(
    () => execFileAsync('bash', ['scripts/run.sh', '--', 'overload', 'http://localhost:8000'], {cwd: benchmarkDir}),
    (error) => {
      assert.equal(error.code, 1)
      assert.match(error.stderr, /ENABLE_OVERLOAD=1/)
      return true
    }
  )
})

test('run script finalizes metadata and preserves signal status on SIGTERM', async () => {
  const toolsDir = await mkdtemp(path.join(tmpdir(), 'zip-benchmark-tools-'))
  const fakeBinDir = path.join(toolsDir, 'bin')
  await mkdir(fakeBinDir, {recursive: true})

  const fakeCorepackPath = path.join(fakeBinDir, 'corepack')
  await writeFile(fakeCorepackPath, `#!/usr/bin/env bash
set -euo pipefail

if [ "\${1:-}" = "pnpm" ] && [ "\${2:-}" = "exec" ] && [ "\${3:-}" = "artillery" ] && [ "\${4:-}" = "--version" ]; then
  echo "Artillery: 2.0.33"
  exit 0
fi

if [ "\${1:-}" = "pnpm" ] && [ "\${2:-}" = "exec" ] && [ "\${3:-}" = "artillery" ] && [ "\${4:-}" = "run" ]; then
  shift 4
  output=""
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "--output" ]; then
      output="$2"
      shift 2
      continue
    fi
    shift
  done

  printf '{"ok":true}\n' > "$output"
  trap 'exit 143' TERM INT
  while kill -0 "$PPID" 2>/dev/null; do
    sleep 0.1
  done
  exit 143
fi

echo "Unexpected corepack invocation: $*" >&2
exit 1
`)
  await chmod(fakeCorepackPath, 0o755)

  const runId = `signal-finalize-${Date.now()}`
  const resultDir = path.join(benchmarkPath, 'results', runId)
  const metadataPath = path.join(resultDir, 'metadata.json')
  const child = spawn('bash', ['scripts/run.sh', 'smoke', 'http://localhost:8000'], {
    cwd: benchmarkPath,
    env: {
      ...process.env,
      RUN_ID: runId,
      GIT_REVISION: 'abc123',
      PYTHON_VERSION: 'Python 3.14.4',
      ZIP_API_VERSION: '0.1.0',
      FASTAPI_VERSION: '0.141.0',
      UVICORN_VERSION: '0.35.0',
      REDIS_VERSION: 'Redis server v=8.2.2',
      PATH: `${fakeBinDir}:${process.env.PATH}`
    }
  })

  try {
    const initialMetadata = await waitForJson(metadataPath, (metadata) => metadata.completed_at === null)
    assert.equal(initialMetadata.run_id, runId)
    assert.equal(initialMetadata.git_revision, 'abc123')

    child.kill('SIGTERM')

    const exit = await waitForExit(child)
    assert.deepEqual(exit, {code: 143, signal: null})

    const finalizedMetadata = JSON.parse(await readFile(metadataPath, 'utf8'))
    assert.match(finalizedMetadata.completed_at, /^\d{4}-\d{2}-\d{2}T.*Z$/)
    assert.equal(finalizedMetadata.run_id, runId)
    assert.equal(finalizedMetadata.started_at, initialMetadata.started_at)
    assert.equal(finalizedMetadata.git_revision, 'abc123')
    assert.equal(finalizedMetadata.target, 'http://localhost:8000')
    assert.equal(finalizedMetadata.profile, 'smoke')
    assert.equal(finalizedMetadata.artillery_version, '2.0.33')
  } finally {
    child.kill('SIGTERM')
    await rm(resultDir, {recursive: true, force: true})
    await rm(toolsDir, {recursive: true, force: true})
  }
})
