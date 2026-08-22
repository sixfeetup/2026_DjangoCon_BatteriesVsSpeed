import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

import {deriveReportIdentity, renderReport} from '../scripts/generate-report.mjs'
import {loadRun} from '../scripts/report-data.mjs'

const benchmarkDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const generateReportScript = path.join(benchmarkDir, 'scripts/generate-report.mjs')
const phasesByProfile = {
  baseline: [{duration: 60, arrivalRate: 5}],
  staircase: [
    {duration: 20, arrivalRate: 5, name: 'warm-up'},
    {duration: 45, arrivalRate: 10, name: '10 rps'},
    {duration: 45, arrivalRate: 25, name: '25 rps'}
  ],
  sustained: [{duration: 300, arrivalRate: 50}],
  overload: [{duration: 30, arrivalRate: 400}]
}

async function writeJson(directory, filename, value) {
  await writeFile(path.join(directory, filename), `${JSON.stringify(value, null, 2)}\n`)
}

async function createRunFixture({
  profile = 'baseline',
  implementation = 'fastapi-zellit',
  runId = `${implementation}-${profile}-20260822T120000Z`,
  directoryName = runId,
  status = 'succeeded',
  exitStatus = status === 'failed' ? 1 : 0,
  imageId = implementation === 'django-zellit' ? 'sha256:django' : 'fastapi-image-a',
  includeP99 = true,
  omit = [],
  omitMetricGroups = [],
  mutate = () => {}
} = {}) {
  const parentDirectory = await mkdtemp(path.join(os.tmpdir(), 'zellit-report-'))
  const runDirectory = path.join(parentDirectory, directoryName)
  await mkdir(runDirectory)

  const config = {
    config: {
      phases: phasesByProfile[profile] || [{duration: 60, arrivalRate: 5}]
    }
  }
  const rawAggregate = {}
  if (!omitMetricGroups.includes('counters')) {
    rawAggregate.counters = {
      'http.requests': 100,
      'http.responses': 98,
      'http.codes.200': 97,
      'http.codes.500': 1,
      'vusers.failed': 2
    }
  }
  if (!omitMetricGroups.includes('rates')) {
    rawAggregate.rates = {
      'http.request_rate': 25
    }
  }
  if (!omitMetricGroups.includes('summaries')) {
    rawAggregate.summaries = {}
    if (!omitMetricGroups.includes('http.response_time')) {
      rawAggregate.summaries['http.response_time'] = includeP99
        ? {count: 98, p50: 12, p95: 30, p99: 45, max: 60}
        : {count: 98, p50: 12, p95: 30, max: 60}
    }
  }
  const raw = {
    aggregate: rawAggregate
  }
  const metadata = {
    run_id: runId,
    started_at: '2026-08-22T12:00:00Z',
    completed_at: '2026-08-22T12:05:00Z',
    status,
    exit_status: exitStatus,
    profile,
    implementation,
    git_revision: 'abc123',
    dataset: {
      schema_version: '1',
      generator_version: '1',
      seed: 20260813,
      digest: 'digest'
    },
    request_corpus: {
      sha256: 'sha',
      rows: 500
    },
    effective_phases: config.config.phases,
    versions: implementation === 'django-zellit'
      ? {python: 'Python 3.12.12', django: '5.2.11', django_ninja: '1.5.3'}
      : {python: 'Python 3.12.12', fastapi: '0.141.1', node: 'v22.23.2'},
    images: implementation === 'django-zellit'
      ? {django: imageId, data: 'sha256:data', artillery: 'sha256:artillery', postgresql: 'sha256:postgres'}
      : {fastapi: imageId, data: 'data-image', artillery: 'artillery-image', postgresql: 'postgresql-image'}
  }
  const runtime = implementation === 'django-zellit'
    ? {
        runtime_label: 'gevent-1',
        server: 'gunicorn',
        workers: 1,
        concurrency_model: 'gevent',
        database_access: 'django-orm',
        database_driver: 'psycopg',
        pool_size: 20
      }
    : {
        runtime_label: 'uvicorn-1',
        server: 'uvicorn',
        workers: 1,
        concurrency_model: 'asyncio',
        database_access: 'sqlalchemy-async',
        database_driver: 'asyncpg',
        pool_size: 20,
        max_overflow: 0
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
  assert.equal(run.artifactDirectory, runDirectory)
  assert.equal(run.profile, 'baseline')
  assert.equal(run.status, 'succeeded')
  assert.equal(run.exit_status, 0)
  assert.equal(run.startedAt, '2026-08-22T12:00:00Z')
  assert.equal(run.completedAt, '2026-08-22T12:05:00Z')
  assert.equal(run.implementation, 'fastapi-zellit')
  assert.equal(run.notes, '')
  assert.equal(run.gitRevision, 'abc123')
  assert.deepEqual(run.dataset, {
    schema_version: '1',
    generator_version: '1',
    seed: 20260813,
    digest: 'digest'
  })
  assert.deepEqual(run.requestCorpus, {sha256: 'sha', rows: 500})
  assert.deepEqual(run.versions, {
    python: 'Python 3.12.12',
    fastapi: '0.141.1',
    node: 'v22.23.2'
  })
  assert.deepEqual(run.images, {
    fastapi: 'fastapi-image-a',
    data: 'data-image',
    artillery: 'artillery-image',
    postgresql: 'postgresql-image'
  })
  assert.equal(run.runtime.runtime_label, 'uvicorn-1')
  assert.deepEqual(run.phases, [{duration: 60, arrivalRate: 5}])
  assert.equal(run.metrics.requests, 100)
  assert.equal(run.metrics.httpErrors, 3)
  assert.equal(run.metrics.errorRate, 0.03)
  assert.deepEqual(run.metrics, {
    requests: 100,
    responses: 98,
    latencySamples: 98,
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

test('report data prefers metadata effective phases over config phases', async () => {
  const runDirectory = await createRunFixture({mutate: ({config, metadata}) => {
    config.config.phases = [{duration: 999, arrivalRate: 999, name: 'configured'}]
    metadata.effective_phases = [{duration: 15, name: 'effective'}]
  }})
  const run = await loadRun(runDirectory)

  assert.deepEqual(run.phases, [{duration: 15, name: 'effective'}])
})

test('report data normalizes present metadata notes as a string', async () => {
  const stringNotesDirectory = await createRunFixture({mutate: ({metadata}) => {
    metadata.notes = 'Stack recreated after a protocol pause.'
  }})
  const numericNotesDirectory = await createRunFixture({runId: 'fastapi-zellit-baseline-20260822T120500Z', mutate: ({metadata}) => {
    metadata.notes = 42
  }})

  assert.equal((await loadRun(stringNotesDirectory)).notes, 'Stack recreated after a protocol pause.')
  assert.equal((await loadRun(numericNotesDirectory)).notes, '42')
})

test('report data normalizes missing p99 as null', async () => {
  const runDirectory = await createRunFixture({includeP99: false})
  const run = await loadRun(runDirectory)

  assert.equal(run.metrics.p99, null)
})

test('report data maps missing metric groups to null', async () => {
  const runDirectory = await createRunFixture({omitMetricGroups: ['counters', 'rates', 'summaries', 'http.response_time']})
  const run = await loadRun(runDirectory)

  assert.deepEqual(run.metrics, {
    requests: null,
    responses: null,
    latencySamples: null,
    failedVusers: null,
    httpErrors: null,
    errorRate: null,
    requestRate: null,
    p50: null,
    p95: null,
    p99: null,
    max: null
  })
})

test('report data leaves error metrics null when 2xx counters are absent', async () => {
  const runDirectory = await createRunFixture({mutate: ({raw}) => {
    delete raw.aggregate.counters['http.codes.200']
  }})
  const run = await loadRun(runDirectory)

  assert.equal(run.metrics.httpErrors, null)
  assert.equal(run.metrics.errorRate, null)
})

test('report data rejects a nonfinite matching 2xx counter', async () => {
  const runDirectory = await createRunFixture()
  const rawPath = path.join(runDirectory, 'raw.json')
  const rawJson = await readFile(rawPath, 'utf8')
  await writeFile(rawPath, rawJson.replace('"http.codes.200": 97', '"http.codes.200": 1e400'))

  await assert.rejects(loadRun(runDirectory), /raw\.aggregate\.counters\.http\.codes\.200 must be a finite number/)
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

test('report data strict default rejects failed metadata', async () => {
  const runDirectory = await createRunFixture({profile: 'overload', status: 'failed'})

  await assert.rejects(loadRun(runDirectory), /metadata\.status must be succeeded/)
})

test('report data with allowFailed accepts and normalizes a failed overload', async () => {
  const runDirectory = await createRunFixture({profile: 'overload', status: 'failed'})
  const run = await loadRun(runDirectory, {allowFailed: true})

  assert.equal(run.profile, 'overload')
  assert.equal(run.status, 'failed')
  assert.equal(run.exit_status, 1)
  assert.equal(run.metrics.requests, 100)
})

test('report data with allowFailed still rejects non-final metadata', async () => {
  const runDirectory = await createRunFixture({status: 'running', exitStatus: null})

  await assert.rejects(loadRun(runDirectory, {allowFailed: true}), /metadata\.status must be succeeded or failed/)
})

test('report data rejects noninteger and status-inconsistent exit statuses', async () => {
  const cases = [
    {status: 'succeeded', exitStatus: null, message: /metadata\.exit_status must be a finite integer/},
    {status: 'succeeded', exitStatus: '0', message: /metadata\.exit_status must be a finite integer/},
    {status: 'succeeded', exitStatus: 0.5, message: /metadata\.exit_status must be a finite integer/},
    {status: 'succeeded', exitStatus: 1, message: /succeeded metadata\.status requires metadata\.exit_status 0/},
    {status: 'failed', exitStatus: 0, message: /failed metadata\.status requires a nonzero metadata\.exit_status/}
  ]

  for (const {status, exitStatus, message} of cases) {
    const runDirectory = await createRunFixture({profile: status === 'failed' ? 'overload' : 'baseline', status, exitStatus})
    await assert.rejects(loadRun(runDirectory, {allowFailed: true}), message)
  }
})

test('report data rejects mismatched directory and run IDs', async () => {
  const runDirectory = await createRunFixture({
    runId: 'fastapi-zellit-other-20260822T120000Z',
    directoryName: 'fastapi-zellit-baseline-20260822T120000Z'
  })

  await assert.rejects(loadRun(runDirectory), /metadata\.run_id must match the run directory name/)
})

test('report identity derives Django identity from four complete runs', async () => {
  const runDirectories = await Promise.all(['baseline', 'staircase', 'sustained', 'overload'].map((profile) =>
    createRunFixture({profile, implementation: 'django-zellit'})
  ))
  const runs = await Promise.all(runDirectories.map((runDirectory) => loadRun(runDirectory)))

  assert.deepEqual(deriveReportIdentity(runs), {
    frameworkName: 'Django',
    implementation: 'django-zellit',
    runtimeLabel: 'gevent-1',
    title: 'Django Zellit gevent-1 benchmark report',
    heading: 'Django Zellit gevent-1 benchmark observations',
    applicationImageKey: 'django'
  })
})

test('report identity preserves the existing FastAPI identity', async () => {
  const runDirectories = await Promise.all(['baseline', 'staircase', 'sustained', 'overload'].map((profile) =>
    createRunFixture({profile})
  ))
  const runs = await Promise.all(runDirectories.map((runDirectory) => loadRun(runDirectory)))

  assert.deepEqual(deriveReportIdentity(runs), {
    frameworkName: 'FastAPI',
    implementation: 'fastapi-zellit',
    runtimeLabel: 'uvicorn-1',
    title: 'FastAPI Zellit benchmark report',
    heading: 'FastAPI Zellit benchmark observations',
    applicationImageKey: 'fastapi'
  })
})

test('report identity rejects mixed, missing, and unsupported identities', async () => {
  const runDirectories = await Promise.all(['baseline', 'staircase', 'sustained', 'overload'].map((profile) =>
    createRunFixture({profile})
  ))
  const runs = await Promise.all(runDirectories.map((runDirectory) => loadRun(runDirectory)))

  assert.throws(
    () => deriveReportIdentity(runs.map((run, index) => index === 3 ? {...run, implementation: 'django-zellit'} : run)),
    /All runs must use the same implementation/
  )
  assert.throws(
    () => deriveReportIdentity(runs.map((run, index) => index === 3 ? {...run, runtime: {...run.runtime, runtime_label: 'uvicorn-2'}} : run)),
    /All runs must use the same runtime label/
  )
  assert.throws(
    () => deriveReportIdentity(runs.map((run, index) => index === 3 ? {...run, runtime: {...run.runtime, runtime_label: ''}} : run)),
    /Every run must have a runtime label/
  )
  assert.throws(
    () => deriveReportIdentity(runs.map((run) => ({...run, implementation: 'flask-zellit'}))),
    /Unsupported implementation: flask-zellit/
  )
})

test('Django report renders dynamic identity and preserves methodology caveats', async () => {
  const runDirectories = await Promise.all(['baseline', 'staircase', 'sustained', 'overload'].map((profile) =>
    createRunFixture({profile, implementation: 'django-zellit'})
  ))
  const runs = await Promise.all(runDirectories.map((runDirectory) => loadRun(runDirectory)))

  const html = renderReport(runs, '2026-08-22T12:10:00Z')

  assert.match(html, /<title>Django Zellit gevent-1 benchmark report<\/title>/)
  assert.match(html, /<h1>Django Zellit gevent-1 benchmark observations<\/h1>/)
  for (const value of [
    'django-zellit', 'Python 3.12.12', '5.2.11', '1.5.3', 'gevent-1', 'gunicorn',
    'gevent', 'django-orm', 'psycopg', 'sha256:django', 'sha256:data',
    'sha256:artillery', 'sha256:postgres'
  ]) {
    assert.match(html, new RegExp(escapeRegExp(value)))
  }
  assert.doesNotMatch(html, /The FastAPI application image identity changed/)
  assert.match(html, /single trial/i)
  assert.match(html, /workload-specific benchmark observation/i)
  assert.match(html, /overload profile is meant to push the service/i)
  assert.match(html, /socket timeouts are excluded from Artillery(?:'|’|&#39;)s response-latency distribution/i)
  assert.match(html, /latency sample count/i)
  assert.match(html, /Application image identities are reported per profile/i)
  assert.match(html, /does not itself establish a FastAPI-versus-Django comparison/i)
  assert.match(html, /does not support production-capacity inference/i)
  assert.doesNotMatch(html, /winner|full-suite success|successful benchmark profiles/i)
})

test('Django report names Django when application image identity changes', async () => {
  const runDirectories = await Promise.all([
    createRunFixture({profile: 'baseline', implementation: 'django-zellit', imageId: 'sha256:django-a'}),
    createRunFixture({profile: 'staircase', implementation: 'django-zellit', imageId: 'sha256:django-a'}),
    createRunFixture({profile: 'sustained', implementation: 'django-zellit', imageId: 'sha256:django-b'}),
    createRunFixture({profile: 'overload', implementation: 'django-zellit', imageId: 'sha256:django-b'})
  ])
  const runs = await Promise.all(runDirectories.map((runDirectory) => loadRun(runDirectory)))

  const html = renderReport(runs, '2026-08-22T12:10:00Z')

  assert.match(html, /The Django application image identity changed across the profiles/)
  assert.match(html, /sha256:django-a/)
  assert.match(html, /sha256:django-b/)
  assert.doesNotMatch(html, /The FastAPI application image identity changed/)
})

test('report render and CLI reject mixed implementation identity', async () => {
  const runDirectories = await Promise.all([
    createRunFixture({profile: 'baseline'}),
    createRunFixture({profile: 'staircase'}),
    createRunFixture({profile: 'sustained'}),
    createRunFixture({profile: 'overload', implementation: 'django-zellit'})
  ])
  const runs = await Promise.all(runDirectories.map((runDirectory) => loadRun(runDirectory)))

  assert.throws(
    () => renderReport(runs, '2026-08-22T12:10:00Z'),
    /All runs must use the same implementation/
  )

  const outputPath = path.join(await mkdtemp(path.join(os.tmpdir(), 'zellit-report-html-')), 'report.html')
  const result = spawnSync(process.execPath, [generateReportScript, outputPath, ...runDirectories], {
    cwd: benchmarkDir,
    encoding: 'utf8'
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr || result.stdout, /All runs must use the same implementation/)
})

test('report render creates standalone HTML for four profiles', async () => {
  const runDirectories = await Promise.all([
    createRunFixture({profile: 'sustained', includeP99: false}),
    createRunFixture({profile: 'baseline', mutate: ({config, metadata}) => {
      metadata.dataset.digest = 'digest <unsafe>'
      config.config.phases = [{duration: 999, arrivalRate: 999, name: 'configured'}]
      metadata.effective_phases = [
        {duration: 15, name: 'effective only'},
        {arrivalRate: 7}
      ]
    }}),
    createRunFixture({profile: 'overload'}),
    createRunFixture({profile: 'staircase'})
  ])
  const runs = await Promise.all(runDirectories.map((runDirectory) => loadRun(runDirectory)))

  const html = renderReport(runs, '2026-08-22T12:10:00Z')

  assert.match(html, /<!doctype html>/i)
  for (const profile of ['baseline', 'staircase', 'sustained', 'overload']) {
    assert.match(html, new RegExp(`data-profile="${profile}"`))
  }
  assert.match(html, /single trial/i)
  assert.match(html, /workload-specific benchmark observation/i)
  assert.match(html, /does not itself establish a FastAPI-versus-Django comparison/i)
  assert.match(html, /Not available/)
  assert.match(html, /&lt;unsafe&gt;/)
  assert.match(html, /effective only/)
  assert.match(html, /15 s/)
  assert.match(html, /7 req\/s/)
  assert.doesNotMatch(html, /configured/)
  assert.doesNotMatch(html, /undefined/)
  assert.doesNotMatch(html, /<(script|link)\b/i)
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/i)
})

test('report render discloses image changes and response-latency sample coverage', async () => {
  const runDirectories = await Promise.all([
    createRunFixture({profile: 'baseline', imageId: '94d26d-baseline-image'}),
    createRunFixture({profile: 'staircase', imageId: '94d26d-baseline-image'}),
    createRunFixture({profile: 'sustained', imageId: 'bb963a-later-image'}),
    createRunFixture({profile: 'overload', imageId: 'bb963a-later-image', status: 'failed'})
  ])
  const runs = await Promise.all(runDirectories.map((runDirectory) => loadRun(runDirectory, {allowFailed: true})))

  const html = renderReport(runs, '2026-08-22T12:10:00Z')

  assert.match(html, /Application image identity changed mid-suite/i)
  assert.match(html, /The FastAPI application image identity changed across the profiles/)
  assert.match(html, /94d26d-baseline-image/)
  assert.match(html, /bb963a-later-image/)
  assert.match(html, /root cause is not established (?:by|from) the preserved artifacts/i)
  assert.match(html, /cross-profile comparisons are (?:therefore )?qualified/i)
  assert.match(html, /does not establish image equivalence/i)
  assert.match(html, /Container images/)
  assert.match(html, /<dt>Requests<\/dt><dd>100<\/dd>/)
  assert.match(html, /<dt>Responses<\/dt><dd>98<\/dd>/)
  assert.match(html, /<dt>Latency samples<\/dt><dd>98<\/dd>/)
  assert.match(html, /socket timeouts are excluded from Artillery(?:'|’|&#39;)s response-latency distribution/i)
  assert.match(html, /latency sample count/i)
})

test('report latency chart uses short labels and visible logarithmic bars', async () => {
  const p99ByProfile = {baseline: 0.01, staircase: 1, sustained: 10, overload: 1000000}
  const runDirectories = await Promise.all(Object.entries(p99ByProfile).map(([profile, p99]) =>
    createRunFixture({profile, mutate: ({raw}) => {
      raw.aggregate.summaries['http.response_time'].p99 = p99
    }})
  ))
  const runs = await Promise.all(runDirectories.map((runDirectory) => loadRun(runDirectory)))

  const html = renderReport(runs, '2026-08-22T12:10:00Z')
  const chart = html.match(/<svg\b[\s\S]*?<\/svg>/i)?.[0] || ''

  assert.match(html, /logarithmic scale/i)
  for (const profile of ['baseline', 'staircase', 'sustained', 'overload']) {
    const label = profile[0].toUpperCase() + profile.slice(1)
    assert.match(chart, new RegExp(`class="svg-label">${label}<\\/text>`))
    assert.match(chart, new RegExp(`data-chart-profile="${profile}"[^>]*width="[1-9][0-9]*"`))
  }
  assert.doesNotMatch(chart, /fastapi-zellit-/)
})

test('report CLI writes HTML with required profiles and creates parent directories', async () => {
  const runDirectories = await Promise.all([
    createRunFixture({profile: 'baseline'}),
    createRunFixture({profile: 'staircase'}),
    createRunFixture({profile: 'sustained'}),
    createRunFixture({profile: 'overload'})
  ])
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'zellit-report-html-'))
  const outputPath = path.join(outputRoot, 'nested', 'benchmark', 'report.html')

  const result = spawnSync(process.execPath, [generateReportScript, outputPath, ...runDirectories], {
    cwd: benchmarkDir,
    encoding: 'utf8'
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(result.stdout.trim(), path.resolve(outputPath))
  const html = await readFile(outputPath, 'utf8')
  for (const runId of [
    'fastapi-zellit-baseline-20260822T120000Z',
    'fastapi-zellit-staircase-20260822T120000Z',
    'fastapi-zellit-sustained-20260822T120000Z',
    'fastapi-zellit-overload-20260822T120000Z'
  ]) {
    assert.match(html, new RegExp(escapeRegExp(runId)))
  }
})

test('report CLI lists failed staircase and overload evidence with acceptance metrics', async () => {
  const runDirectories = await Promise.all([
    createRunFixture({profile: 'baseline'}),
    createRunFixture({profile: 'staircase', status: 'failed', exitStatus: 3, mutate: ({raw, metadata}) => {
      raw.aggregate.counters['http.codes.200'] = 89
      raw.aggregate.counters['vusers.failed'] = 9
      metadata.notes = 'Staircase failure notes <preserved>.'
    }}),
    createRunFixture({profile: 'sustained'}),
    createRunFixture({profile: 'overload', status: 'failed', exitStatus: 7, mutate: ({raw, metadata}) => {
      raw.aggregate.counters['http.codes.200'] = 79
      raw.aggregate.counters['vusers.failed'] = 20
      metadata.notes = 'Overload failure notes.'
    }})
  ])
  const outputPath = path.join(await mkdtemp(path.join(os.tmpdir(), 'zellit-report-html-')), 'report.html')

  const result = spawnSync(process.execPath, [generateReportScript, outputPath, ...runDirectories], {
    cwd: benchmarkDir,
    encoding: 'utf8'
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const html = await readFile(outputPath, 'utf8')
  const failureEvidence = html.match(/<section class="warning failure-evidence"[\s\S]*?<\/section>/i)?.[0] || ''
  assert.match(failureEvidence, /FAILED profile evidence preserved/i)
  assert.match(failureEvidence, /Staircase[\s\S]*?<td>3<\/td>[\s\S]*?<td>9<\/td>[\s\S]*?<td>11<\/td>/i)
  assert.match(failureEvidence, /Overload[\s\S]*?<td>7<\/td>[\s\S]*?<td>20<\/td>[\s\S]*?<td>21<\/td>/i)
  assert.match(failureEvidence, /vusers\.failed == 0/)
  assert.match(html, /Failed profiles: Staircase and Overload\./)
  assert.match(html, /Staircase failure notes &lt;preserved&gt;\./)
  assert.match(html, /Overload failure notes\./)
  assert.doesNotMatch(html, /Overload acceptance condition failed/i)
  assert.doesNotMatch(html, /winner|full-suite success|successful benchmark profiles/i)
})

test('FastAPI report keeps its lone failed overload prominently labeled', async () => {
  const runDirectories = await Promise.all([
    createRunFixture({profile: 'baseline'}),
    createRunFixture({profile: 'staircase'}),
    createRunFixture({profile: 'sustained'}),
    createRunFixture({profile: 'overload', status: 'failed'})
  ])
  const runs = await Promise.all(runDirectories.map((runDirectory) => loadRun(runDirectory, {allowFailed: true})))

  const html = renderReport(runs, '2026-08-22T12:10:00Z')
  const failureEvidence = html.match(/<section class="warning failure-evidence"[\s\S]*?<\/section>/i)?.[0] || ''

  assert.match(html, /Failed profiles: Overload\./)
  assert.match(failureEvidence, /Overload[\s\S]*?<td>1<\/td>[\s\S]*?<td>2<\/td>[\s\S]*?<td>3<\/td>/i)
  assert.doesNotMatch(failureEvidence, /<td>(?:Baseline|Staircase|Sustained)<\/td>/i)
})

test('report CLI accepts a failed sustained profile and preserves successful profiles', async () => {
  const runDirectories = await Promise.all([
    createRunFixture({profile: 'baseline'}),
    createRunFixture({profile: 'staircase'}),
    createRunFixture({profile: 'sustained', status: 'failed', exitStatus: 4}),
    createRunFixture({profile: 'overload'})
  ])
  const outputPath = path.join(await mkdtemp(path.join(os.tmpdir(), 'zellit-report-html-')), 'report.html')

  const result = spawnSync(process.execPath, [generateReportScript, outputPath, ...runDirectories], {
    cwd: benchmarkDir,
    encoding: 'utf8'
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const html = await readFile(outputPath, 'utf8')
  assert.match(html, /Failed profiles: Sustained\./)
  assert.match(html, /Sustained[\s\S]*?<td>4<\/td>/i)
  assert.match(html, /data-profile="baseline"[\s\S]*?status-succeeded/i)
  assert.match(html, /data-profile="staircase"[\s\S]*?status-succeeded/i)
  assert.match(html, /data-profile="overload"[\s\S]*?status-succeeded/i)
})

test('successful profiles render metadata notes without suite-success or winner claims', async () => {
  const runDirectories = await Promise.all([
    createRunFixture({profile: 'baseline'}),
    createRunFixture({profile: 'staircase', mutate: ({metadata}) => {
      metadata.notes = 'Shared original stack.'
    }}),
    createRunFixture({profile: 'sustained'}),
    createRunFixture({profile: 'overload'})
  ])
  const runs = await Promise.all(runDirectories.map((runDirectory) => loadRun(runDirectory)))

  const html = renderReport(runs, '2026-08-22T12:10:00Z')
  const executiveSummary = html.match(/<section>[\s\S]*?<\/section>/i)?.[0] || ''

  assert.doesNotMatch(html, /failure-evidence/)
  assert.match(html, /Metadata notes/)
  assert.match(html, /Shared original stack\./)
  assert.match(html, /Not available/)
  assert.doesNotMatch(executiveSummary, /winner|full-suite success|successful (?:suite|benchmark profiles)/i)
})

test('report CLI rejects status-inconsistent exit statuses', async () => {
  for (const invalidRun of [
    {profile: 'baseline', status: 'succeeded', exitStatus: 0.5, message: /metadata\.exit_status must be a finite integer/},
    {profile: 'baseline', status: 'succeeded', exitStatus: 2, message: /succeeded metadata\.status requires metadata\.exit_status 0/},
    {profile: 'overload', status: 'failed', exitStatus: 0, message: /failed metadata\.status requires a nonzero metadata\.exit_status/}
  ]) {
    const runDirectories = await Promise.all([
      createRunFixture({profile: 'baseline', ...(invalidRun.profile === 'baseline' ? invalidRun : {})}),
      createRunFixture({profile: 'staircase'}),
      createRunFixture({profile: 'sustained'}),
      createRunFixture({profile: 'overload', ...(invalidRun.profile === 'overload' ? invalidRun : {})})
    ])
    const outputPath = path.join(await mkdtemp(path.join(os.tmpdir(), 'zellit-report-html-')), 'report.html')

    const result = spawnSync(process.execPath, [generateReportScript, outputPath, ...runDirectories], {
      cwd: benchmarkDir,
      encoding: 'utf8'
    })

    assert.notEqual(result.status, 0)
    assert.match(result.stderr || result.stdout, invalidRun.message)
  }
})

test('report CLI rejects duplicate profiles', async () => {
  const runDirectories = await Promise.all([
    createRunFixture({profile: 'baseline'}),
    createRunFixture({profile: 'baseline', runId: 'fastapi-zellit-baseline-20260822T120500Z'}),
    createRunFixture({profile: 'sustained'}),
    createRunFixture({profile: 'overload'})
  ])
  const outputPath = path.join(await mkdtemp(path.join(os.tmpdir(), 'zellit-report-html-')), 'report.html')

  const result = spawnSync(process.execPath, [generateReportScript, outputPath, ...runDirectories], {
    cwd: benchmarkDir,
    encoding: 'utf8'
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr || result.stdout, /Duplicate profile: baseline/)
})

test('report CLI rejects a missing required profile', async () => {
  const runDirectories = await Promise.all([
    createRunFixture({profile: 'baseline'}),
    createRunFixture({profile: 'staircase'}),
    createRunFixture({profile: 'sustained'})
  ])
  const outputPath = path.join(await mkdtemp(path.join(os.tmpdir(), 'zellit-report-html-')), 'report.html')

  const result = spawnSync(process.execPath, [generateReportScript, outputPath, ...runDirectories], {
    cwd: benchmarkDir,
    encoding: 'utf8'
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr || result.stdout, /Missing required profiles: overload/)
})

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
