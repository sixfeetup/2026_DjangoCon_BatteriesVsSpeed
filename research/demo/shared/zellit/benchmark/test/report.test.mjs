import assert from 'node:assert/strict'
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {loadRun} from '../scripts/report-data.mjs'

async function writeJson(directory, filename, value) {
  await writeFile(path.join(directory, filename), `${JSON.stringify(value, null, 2)}\n`)
}

async function createRunFixture({
  runId = 'fastapi-zellit-baseline-20260822T120000Z',
  directoryName = runId,
  status = 'succeeded',
  includeP99 = true,
  omit = [],
  mutate = () => {}
} = {}) {
  const parentDirectory = await mkdtemp(path.join(os.tmpdir(), 'zellit-report-'))
  const runDirectory = path.join(parentDirectory, directoryName)
  await mkdir(runDirectory)

  const config = {
    config: {
      phases: [{duration: 60, arrivalRate: 5}]
    }
  }
  const raw = {
    aggregate: {
      counters: {
        'http.requests': 100,
        'http.responses': 98,
        'http.codes.200': 97,
        'http.codes.500': 1,
        'vusers.failed': 2
      },
      rates: {
        'http.request_rate': 25
      },
      summaries: {
        'http.response_time': includeP99
          ? {p50: 12, p95: 30, p99: 45, max: 60}
          : {p50: 12, p95: 30, max: 60}
      }
    }
  }
  const metadata = {
    run_id: runId,
    started_at: '2026-08-22T12:00:00Z',
    completed_at: '2026-08-22T12:05:00Z',
    status,
    profile: 'baseline',
    implementation: 'fastapi-zellit',
    git_revision: 'abc123',
    dataset: {digest: 'digest'},
    request_corpus: {sha256: 'sha'},
    versions: {node: 'v22.23.2'}
  }
  const runtime = {
    runtime_label: 'uvicorn-1',
    server: 'uvicorn'
  }
  mutate({config, raw, metadata, runtime})

  const files = [
    ['config.json', config],
    ['raw.json', raw],
    ['metadata.json', metadata],
    ['runtime.json', runtime]
  ]
  for (const [filename, value] of files) {
    if (!omit.includes(filename)) await writeJson(runDirectory, filename, value)
  }
  return runDirectory
}

test('report data loads and normalizes benchmark artifacts', async () => {
  const runDirectory = await createRunFixture()
  const run = await loadRun(runDirectory)

  assert.equal(run.runId, 'fastapi-zellit-baseline-20260822T120000Z')
  assert.equal(run.profile, 'baseline')
  assert.equal(run.metrics.requests, 100)
  assert.equal(run.metrics.httpErrors, 3)
  assert.equal(run.metrics.errorRate, 0.03)
  assert.deepEqual(run.metrics, {
    requests: 100,
    responses: 98,
    failedVusers: 2,
    httpErrors: 3,
    errorRate: 0.03,
    requestRate: 25,
    p50: 12,
    p95: 30,
    p99: 45,
    max: 60
  })
})

test('report data normalizes missing p99 as null', async () => {
  const runDirectory = await createRunFixture({includeP99: false})
  const run = await loadRun(runDirectory)

  assert.equal(run.metrics.p99, null)
})

test('report data rejects malformed JSON with the artifact path', async () => {
  const runDirectory = await createRunFixture()
  const artifactPath = path.join(runDirectory, 'raw.json')
  await writeFile(artifactPath, '{')

  await assert.rejects(loadRun(runDirectory), new RegExp(`Cannot read ${escapeRegExp(artifactPath)}:`))
})

test('report data rejects a missing artifact with its filename', async () => {
  const runDirectory = await createRunFixture({omit: ['runtime.json']})

  await assert.rejects(loadRun(runDirectory), /Cannot read .*runtime\.json:/)
})

test('report data rejects non-succeeded metadata', async () => {
  const runDirectory = await createRunFixture({status: 'running'})

  await assert.rejects(loadRun(runDirectory), /metadata\.status must be succeeded/)
})

test('report data rejects mismatched directory and run IDs', async () => {
  const runDirectory = await createRunFixture({
    runId: 'fastapi-zellit-other-20260822T120000Z',
    directoryName: 'fastapi-zellit-baseline-20260822T120000Z'
  })

  await assert.rejects(loadRun(runDirectory), /metadata\.run_id must match the run directory name/)
})

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
