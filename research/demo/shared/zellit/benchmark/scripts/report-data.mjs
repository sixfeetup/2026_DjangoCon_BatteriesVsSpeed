import {readFile} from 'node:fs/promises'
import path from 'node:path'

async function readJson(runDirectory, filename) {
  const artifactPath = path.resolve(runDirectory, filename)
  try {
    return JSON.parse(await readFile(artifactPath, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Cannot read ${artifactPath}: ${message}`)
  }
}

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function nullableNumber(value) {
  if (value === null || value === undefined) return null
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function optionalObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value
}

function sumSuccessfulCodes(counters) {
  let total = 0
  let hasSuccessfulCode = false
  for (const [name, value] of Object.entries(counters)) {
    const match = /^http\.codes\.(2\d\d)$/.exec(name)
    if (match) {
      hasSuccessfulCode = true
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`raw.aggregate.counters.${name} must be a finite number`)
      }
      total += value
    }
  }
  return {total, hasSuccessfulCode}
}

function validateExitStatus(metadata) {
  const exitStatus = metadata.exit_status
  if (!Number.isInteger(exitStatus)) throw new Error('metadata.exit_status must be a finite integer')
  if (metadata.status === 'succeeded' && exitStatus !== 0) {
    throw new Error('succeeded metadata.status requires metadata.exit_status 0')
  }
  if (metadata.status === 'failed' && exitStatus === 0) {
    throw new Error('failed metadata.status requires a nonzero metadata.exit_status')
  }
  return exitStatus
}

export async function loadRun(runDirectory, {allowFailed = false} = {}) {
  const artifactDirectory = path.resolve(runDirectory)
  const config = requiredObject(await readJson(artifactDirectory, 'config.json'), 'config')
  const raw = requiredObject(await readJson(artifactDirectory, 'raw.json'), 'raw')
  const metadata = requiredObject(await readJson(artifactDirectory, 'metadata.json'), 'metadata')
  const runtime = requiredObject(await readJson(artifactDirectory, 'runtime.json'), 'runtime')

  const runId = path.basename(artifactDirectory)
  if (metadata.run_id !== runId) throw new Error('metadata.run_id must match the run directory name')
  if (allowFailed) {
    if (!['succeeded', 'failed'].includes(metadata.status)) throw new Error('metadata.status must be succeeded or failed')
  } else if (metadata.status !== 'succeeded') {
    throw new Error('metadata.status must be succeeded')
  }
  const exitStatus = validateExitStatus(metadata)

  const configuredPhases = requiredObject(config.config, 'config.config').phases
  if (!Array.isArray(configuredPhases)) throw new Error('config.config.phases must be an array')
  const effectivePhases = Array.isArray(metadata.effective_phases) ? metadata.effective_phases : configuredPhases

  const aggregate = requiredObject(raw.aggregate, 'raw.aggregate')
  const counters = optionalObject(aggregate.counters)
  const rates = optionalObject(aggregate.rates)
  const summaries = optionalObject(aggregate.summaries)
  const responseSummary = optionalObject(summaries?.['http.response_time'])

  const requests = nullableNumber(counters?.['http.requests'])
  const responses = nullableNumber(counters?.['http.responses'])
  const failedVusers = nullableNumber(counters?.['vusers.failed'])
  const requestRate = nullableNumber(rates?.['http.request_rate'])
  const {total: successfulResponses, hasSuccessfulCode} = counters ? sumSuccessfulCodes(counters) : {total: 0, hasSuccessfulCode: false}
  const httpErrors = requests === null || !hasSuccessfulCode ? null : Math.max(0, requests - successfulResponses)
  const errorRate = requests !== null && requests > 0 && httpErrors !== null ? httpErrors / requests : null

  return {
    runId,
    artifactDirectory,
    profile: metadata.profile,
    status: metadata.status,
    exit_status: exitStatus,
    startedAt: metadata.started_at,
    completedAt: metadata.completed_at,
    implementation: metadata.implementation,
    gitRevision: metadata.git_revision,
    dataset: requiredObject(metadata.dataset, 'metadata.dataset'),
    requestCorpus: requiredObject(metadata.request_corpus, 'metadata.request_corpus'),
    versions: requiredObject(metadata.versions, 'metadata.versions'),
    images: requiredObject(metadata.images, 'metadata.images'),
    runtime,
    configuredPhases,
    effectivePhases,
    phases: effectivePhases,
    metrics: {
      requests,
      responses,
      latencySamples: nullableNumber(responseSummary?.count),
      failedVusers,
      httpErrors,
      errorRate,
      requestRate,
      p50: nullableNumber(responseSummary?.p50),
      p95: nullableNumber(responseSummary?.p95),
      p99: nullableNumber(responseSummary?.p99),
      max: nullableNumber(responseSummary?.max)
    }
  }
}
