import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import { buildConfig } from '../scripts/render-config.mjs'
import processor from '../processor.cjs'
import { writeMetadata } from '../scripts/write-metadata.mjs'

const execFileAsync = promisify(execFile)
const benchmarkDir = new URL('..', import.meta.url)
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
