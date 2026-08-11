import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
  'target_implementation',
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

async function waitForPath(filePath, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await access(filePath)
      return
    } catch {
      await delay(50)
    }
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

test('render config honors PREFIX_CORPUS_PATH override', async () => {
  const config = await buildConfig('smoke', 'http://localhost:8000', {
    PREFIX_CORPUS_PATH: '/data/benchmark_prefixes.csv'
  })
  assert.equal(config.config.payload.path, '/data/benchmark_prefixes.csv')
})

test('empty simple overrides are ignored', async () => {
  const config = await buildConfig('smoke', 'http://localhost:8000', {
    SMOKE_RATE: '',
    SMOKE_DURATION: ''
  })
  assert.deepEqual(config.config.phases, [{duration: 10, arrivalRate: 1}])
})

test('docker benchmark image is pinned for reproducible runs', async () => {
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8')
  assert.match(dockerfile, /FROM node:22\.23\.2-bookworm-slim/)
  assert.match(dockerfile, /corepack prepare pnpm@11\.21\.0 --activate/)
  assert.match(dockerfile, /COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml \.\//)
  assert.match(dockerfile, /pnpm install --frozen-lockfile/)
})

test('docker benchmark wrapper is wired for compose benchmark service', async () => {
  const script = await readFile(new URL('../scripts/run-compose.sh', import.meta.url), 'utf8')
  assert.match(script, /--profile benchmark build artillery/)
  assert.match(script, /--profile benchmark run --rm artillery/)
  assert.match(script, /importlib\.metadata\.version\("zip-api"\)/)
  assert.match(script, /EXECUTION_MODE=docker/)
  assert.match(script, /GIT_REVISION=/)
})

test('run-compose preserves the benchmark failure when cleanup also fails', async () => {
  const toolsDir = await mkdtemp(path.join(tmpdir(), 'zip-compose-tools-'))
  const fakeBinDir = path.join(toolsDir, 'bin')
  const dockerLogPath = path.join(toolsDir, 'docker.log')
  await mkdir(fakeBinDir, {recursive: true})

  const fakeGitPath = path.join(fakeBinDir, 'git')
  await writeFile(fakeGitPath, `#!/usr/bin/env bash
set -euo pipefail

echo "abc123"
`)
  await chmod(fakeGitPath, 0o755)

  const fakeDockerPath = path.join(fakeBinDir, 'docker')
  await writeFile(fakeDockerPath, `#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"

if [ "\${1:-}" != "compose" ]; then
  echo "Unexpected docker invocation: $*" >&2
  exit 1
fi

shift
joined="$*"

case "\${1:-}" in
  up)
    exit 0
    ;;
  exec)
    if [ "\${4:-}" = "python" ] && [ "\${5:-}" = "--version" ]; then
      echo "Python 3.14.4"
      exit 0
    fi

    case "$joined" in
      *'version("zip-api")'*)
        echo "0.1.0"
        exit 0
        ;;
      *'version("fastapi")'*)
        echo "0.141.0"
        exit 0
        ;;
      *'version("uvicorn")'*)
        echo "0.35.0"
        exit 0
        ;;
    esac

    if [ "\${3:-}" = "redis" ]; then
      echo "Redis server v=8.2.2"
      exit 0
    fi
    ;;
  --profile)
    if [ "\${2:-}" = "benchmark" ] && [ "\${3:-}" = "build" ]; then
      exit 0
    fi

    if [ "\${2:-}" = "benchmark" ] && [ "\${3:-}" = "run" ]; then
      exit 23
    fi
    ;;
  down)
    exit 91
    ;;
esac

echo "Unexpected docker compose invocation: $joined" >&2
exit 1
`)
  await chmod(fakeDockerPath, 0o755)

  try {
    await assert.rejects(
      () => execFileAsync('bash', ['scripts/run-compose.sh', 'smoke'], {
        cwd: benchmarkPath,
        env: {
          ...process.env,
          CLEANUP: '1',
          TARGET_URL: 'https://wrong-target.example.test',
          FAKE_DOCKER_LOG: dockerLogPath,
          PATH: `${fakeBinDir}:${process.env.PATH}`
        }
      }),
      (error) => {
        assert.equal(error.code, 23)
        return true
      }
    )

    const dockerLog = await readFile(dockerLogPath, 'utf8')
    assert.match(dockerLog, /compose --profile benchmark run --rm artillery smoke http:\/\/api:8000/)
    assert.doesNotMatch(dockerLog, /wrong-target/)
    assert.match(dockerLog, /compose down -v --remove-orphans/)
  } finally {
    await rm(toolsDir, {recursive: true, force: true})
  }
})

test('fastapi compose exposes optional benchmark artillery service on loopback ports', async () => {
  const compose = await readFile(new URL('../../../../fastapi/zip/compose.yaml', import.meta.url), 'utf8')
  assert.match(compose, /^\s{2}artillery:/m)
  assert.match(compose, /profiles:\s*\n\s*- benchmark/)
  assert.doesNotMatch(compose, /TARGET_URL:/)
  assert.match(compose, /TARGET_IMPLEMENTATION:/)
  assert.match(compose, /127\.0\.0\.1:\$\{REDIS_PORT:-6379\}:6379/)
  assert.match(compose, /127\.0\.0\.1:\$\{API_PORT:-8000\}:8000/)
  assert.match(compose, /EXECUTION_MODE: docker/)
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

function zipResponseBody(prefix = '123') {
  return JSON.stringify(Array.from({length: 10}, (_, index) => ({
    zip: `${prefix}${String(index).padStart(2, '0')}`,
    city: `City ${index}`
  })))
}

function callbackContext(q = '123') {
  return {vars: {q}}
}

test('response validator accepts exact requested, unique, ascending payload contract', () => {
  assert.doesNotThrow(() => processor.assertZipResponse(
    {},
    {statusCode: 200, body: zipResponseBody()},
    callbackContext()
  ))
})

test('response validator rejects wrong payload length', () => {
  assert.throws(
    () => processor.assertZipResponse({}, {statusCode: 200, body: '[]'}, callbackContext()),
    /10 records/
  )
})

test('response validator rejects unexpected object shapes', () => {
  const invalidBody = JSON.stringify(Array.from({length: 10}, () => ({zip: '12345', city: 'Town', state: 'IN'})))
  assert.throws(
    () => processor.assertZipResponse({}, {statusCode: 200, body: invalidBody}, callbackContext()),
    /only zip and city/
  )
})

test('response validator rejects ZIPs outside the requested prefix', () => {
  assert.throws(
    () => processor.assertZipResponse({}, {statusCode: 200, body: zipResponseBody('124')}, callbackContext('123')),
    /requested prefix 123/
  )
})

test('response validator rejects duplicate ZIPs', () => {
  const records = JSON.parse(zipResponseBody())
  records[1].zip = records[0].zip
  assert.throws(
    () => processor.assertZipResponse({}, {statusCode: 200, body: JSON.stringify(records)}, callbackContext()),
    /unique ZIPs/
  )
})

test('response validator rejects ZIPs that are not strictly ascending', () => {
  const records = JSON.parse(zipResponseBody())
  ;[records[0], records[1]] = [records[1], records[0]]
  assert.throws(
    () => processor.assertZipResponse({}, {statusCode: 200, body: JSON.stringify(records)}, callbackContext()),
    /strictly ascending/
  )
})

test('response callback accepts valid payload without emitting an invalid counter', () => {
  const emissions = []
  const nextCalls = []
  processor.assertZipResponse(
    {},
    {statusCode: 200, body: zipResponseBody()},
    callbackContext(),
    {emit: (...args) => emissions.push(args)},
    (...args) => nextCalls.push(args)
  )

  assert.deepEqual(emissions, [])
  assert.deepEqual(nextCalls, [[]])
})

test('response callback reads the requested prefix from Artillery request parameters', () => {
  const emissions = []
  const nextCalls = []
  processor.assertZipResponse(
    {url: 'http://localhost:8000/zip-codes?q=123'},
    {statusCode: 200, body: zipResponseBody()},
    {vars: {}},
    {emit: (...args) => emissions.push(args)},
    (...args) => nextCalls.push(args)
  )

  assert.deepEqual(emissions, [])
  assert.deepEqual(nextCalls, [[]])
})

test('response callback emits invalid counter and passes validation error to next', () => {
  const emissions = []
  const nextCalls = []
  processor.assertZipResponse(
    {},
    {statusCode: 200, body: zipResponseBody('124')},
    callbackContext('123'),
    {emit: (...args) => emissions.push(args)},
    (...args) => nextCalls.push(args)
  )

  assert.deepEqual(emissions, [['counter', 'zip.invalid_response', 1]])
  assert.equal(nextCalls.length, 1)
  assert.equal(nextCalls[0].length, 1)
  assert.match(nextCalls[0][0].message, /requested prefix 123/)
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
    target_implementation: 'fastapi-zip',
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

test('run script records EXECUTION_MODE from the environment', async () => {
  const script = await readFile(new URL('../scripts/run.sh', import.meta.url), 'utf8')
  assert.match(script, /EXECUTION_MODE_VALUE="\$\{EXECUTION_MODE:-host\}"/)
})

test('run script resolves the host compose file only on demand', async () => {
  const script = await readFile(new URL('../scripts/run.sh', import.meta.url), 'utf8')
  assert.match(script, /compose_file\(\)/)
  assert.doesNotMatch(script, /^COMPOSE_FILE=/m)
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

test('run script rejects traversal and unsafe RUN_ID values', async () => {
  const disposablePaths = new Map([
    ['../outside-results', path.join(benchmarkPath, 'outside-results')],
    ['nested/run', path.join(benchmarkPath, 'results', 'nested')],
    ['nested\\run', path.join(benchmarkPath, 'results', 'nested\\run')],
    ['bad run', path.join(benchmarkPath, 'results', 'bad run')]
  ])

  for (const runId of ['../outside-results', 'nested/run', 'nested\\run', '.', '..', 'bad run']) {
    try {
      await assert.rejects(
        () => execFileAsync('bash', ['scripts/run.sh', 'unknown', 'http://localhost:8000'], {
          cwd: benchmarkPath,
          env: {...process.env, RUN_ID: runId}
        }),
        (error) => {
          assert.equal(error.code, 1)
          assert.match(error.stderr, /Invalid RUN_ID/)
          return true
        }
      )
    } finally {
      const disposablePath = disposablePaths.get(runId)
      if (disposablePath) {
        await rm(disposablePath, {recursive: true, force: true})
      }
    }
  }
})

test('run script rejects an existing run directory', async () => {
  const runId = `collision-${Date.now()}`
  const resultDir = path.join(benchmarkPath, 'results', runId)
  await mkdir(resultDir)

  try {
    await assert.rejects(
      () => execFileAsync('bash', ['scripts/run.sh', 'unknown', 'http://localhost:8000'], {
        cwd: benchmarkPath,
        env: {...process.env, RUN_ID: runId}
      }),
      (error) => {
        assert.equal(error.code, 1)
        assert.match(error.stderr, /already exists/)
        return true
      }
    )
  } finally {
    await rm(resultDir, {recursive: true, force: true})
  }
})

test('alternate host targets require explicit target and component metadata', async () => {
  const toolsDir = await mkdtemp(path.join(tmpdir(), 'zip-explicit-metadata-'))
  const fakeDockerPath = path.join(toolsDir, 'docker')
  const runId = `explicit-metadata-${Date.now()}`
  const resultDir = path.join(benchmarkPath, 'results', runId)
  await writeFile(fakeDockerPath, '#!/usr/bin/env bash\necho "docker must not be used for explicit metadata" >&2\nexit 99\n')
  await chmod(fakeDockerPath, 0o755)

  try {
    await assert.rejects(
      () => execFileAsync('bash', ['scripts/run.sh', 'smoke', 'https://benchmark.example.test'], {
        cwd: benchmarkPath,
        env: {
          ...process.env,
          RUN_ID: runId,
          PATH: `${toolsDir}:${process.env.PATH}`
        }
      }),
      (error) => {
        assert.equal(error.code, 1)
        assert.match(error.stderr, /TARGET_IMPLEMENTATION/)
        assert.doesNotMatch(error.stderr, /docker must not be used/)
        return true
      }
    )
  } finally {
    await rm(resultDir, {recursive: true, force: true})
    await rm(toolsDir, {recursive: true, force: true})
  }
})

test('local Compose metadata discovery rejects alternate targets before Docker lookup', async () => {
  const toolsDir = await mkdtemp(path.join(tmpdir(), 'zip-local-compose-target-'))
  const fakeDockerPath = path.join(toolsDir, 'docker')
  const runId = `local-compose-target-${Date.now()}`
  const resultDir = path.join(benchmarkPath, 'results', runId)
  await writeFile(fakeDockerPath, '#!/usr/bin/env bash\necho "docker must not be used for an alternate target" >&2\nexit 99\n')
  await chmod(fakeDockerPath, 0o755)

  try {
    await assert.rejects(
      () => execFileAsync('bash', ['scripts/run.sh', 'smoke', 'https://benchmark.example.test'], {
        cwd: benchmarkPath,
        env: {
          ...process.env,
          METADATA_SOURCE: 'local-compose',
          RUN_ID: runId,
          PATH: `${toolsDir}:${process.env.PATH}`
        }
      }),
      (error) => {
        assert.equal(error.code, 1)
        assert.match(error.stderr, /local-compose only supports http:\/\/localhost/)
        assert.doesNotMatch(error.stderr, /docker must not be used/)
        return true
      }
    )
  } finally {
    await rm(resultDir, {recursive: true, force: true})
    await rm(toolsDir, {recursive: true, force: true})
  }
})

test('run script finalizes metadata when SIGTERM lands during the initial metadata write', async () => {
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
  echo "artillery should not start when SIGTERM lands during the initial metadata write" >&2
  exit 1
fi

echo "Unexpected corepack invocation: $*" >&2
exit 1
`)
  await chmod(fakeCorepackPath, 0o755)

  const fakeNodePath = path.join(fakeBinDir, 'node')
  await writeFile(fakeNodePath, `#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ge 1 ] && [ "$1" = "$WRITE_METADATA_SCRIPT" ] && [ -n "\${INITIAL_METADATA_WRITE_MARKER:-}" ] && [ ! -f "\${INITIAL_METADATA_WRITE_MARKER}" ]; then
  : > "\${INITIAL_METADATA_WRITE_MARKER}"
  sleep 30
fi

exec "$REAL_NODE" "$@"
`)
  await chmod(fakeNodePath, 0o755)

  const runId = `signal-initial-metadata-${Date.now()}`
  const resultDir = path.join(benchmarkPath, 'results', runId)
  const metadataPath = path.join(resultDir, 'metadata.json')
  const markerPath = path.join(toolsDir, 'initial-metadata-write-started')
  const child = spawn('bash', ['scripts/run.sh', 'smoke', 'http://localhost:8000'], {
    cwd: benchmarkPath,
    detached: true,
    env: {
      ...process.env,
      RUN_ID: runId,
      GIT_REVISION: 'abc123',
      TARGET_IMPLEMENTATION: 'fastapi-zip',
      PYTHON_VERSION: 'Python 3.14.4',
      ZIP_API_VERSION: '0.1.0',
      FASTAPI_VERSION: '0.141.0',
      UVICORN_VERSION: '0.35.0',
      REDIS_VERSION: 'Redis server v=8.2.2',
      REAL_NODE: process.execPath,
      WRITE_METADATA_SCRIPT: path.join(benchmarkPath, 'scripts', 'write-metadata.mjs'),
      INITIAL_METADATA_WRITE_MARKER: markerPath,
      PATH: `${fakeBinDir}:${process.env.PATH}`
    }
  })

  try {
    await waitForPath(markerPath)

    process.kill(-child.pid, 'SIGTERM')

    const exit = await waitForExit(child)
    assert.deepEqual(exit, {code: 143, signal: null})

    const finalizedMetadata = await waitForJson(metadataPath, (metadata) => typeof metadata.completed_at === 'string')
    assert.match(finalizedMetadata.completed_at, /^\d{4}-\d{2}-\d{2}T.*Z$/)
    assert.equal(finalizedMetadata.run_id, runId)
    assert.equal(finalizedMetadata.git_revision, 'abc123')
    assert.equal(finalizedMetadata.target, 'http://localhost:8000')
    assert.equal(finalizedMetadata.profile, 'smoke')
    assert.equal(finalizedMetadata.artillery_version, '2.0.33')
  } finally {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {}
    await rm(resultDir, {recursive: true, force: true})
    await rm(toolsDir, {recursive: true, force: true})
  }
})
