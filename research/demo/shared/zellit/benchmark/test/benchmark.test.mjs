import assert from 'node:assert/strict'
import {mkdtemp, mkdir, readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import test from 'node:test'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'

import {buildConfig, positiveInteger} from '../scripts/render-config.mjs'
import {normalizeMetadata} from '../scripts/write-metadata.mjs'

const require = createRequire(import.meta.url)
const {assertZellitResponse, prepareZellitRequest, validateZellitResponse} = require('../processor.cjs')
const benchmarkDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const expectedProfiles = {
  smoke: [[10, 1]], baseline: [[30, 100]],
  staircase: [[30, 100], [30, 200], [30, 300]],
  sustained: [[30, 300]], overload: [[30, 300]]
}

for (const [profile, expected] of Object.entries(expectedProfiles)) {
  test(`${profile} renders committed phases`, async () => {
    const config = await buildConfig(profile, 'http://api:8000', profile === 'overload' ? {ENABLE_OVERLOAD: '1'} : {})
    assert.deepEqual(config.config.phases.map(({duration, arrivalRate}) => [duration, arrivalRate]), expected)
    assert.equal(config.config.payload.fields.join(','), 'zip_code,offset')
    assert.equal(config.config.plugins.ensure.conditions[0].expression, 'vusers.failed == 0')
    assert.equal(config.scenarios[0].flow[0].get.url, '/api/v1/zip-codes/{{ zip_code }}/listings?limit=20&offset={{ offset }}')
    assert.equal(path.isAbsolute(config.config.processor), true)
    assert.equal(path.isAbsolute(config.config.payload.path), true)
  })
}

test('profile overrides are validated and apply to every staircase phase', async () => {
  const config = await buildConfig('staircase', 'https://zellit.test', {STAIRCASE_RATES: '120,240,360', STAIRCASE_DURATION: '20'})
  assert.deepEqual(config.config.phases.map((p) => [p.duration, p.arrivalRate]), [[20,120],[20,240],[20,360]])
  assert.throws(() => positiveInteger('RATE', '0'), /positive integer|between/)
  await assert.rejects(buildConfig('staircase', 'http://api:8000', {STAIRCASE_RATES: '1,2'}), /exactly 3/)
  await assert.rejects(buildConfig('overload', 'http://api:8000', {}), /ENABLE_OVERLOAD/)
})

function payload() {
  return {
    zip_code: {code: '46201'},
    market: {listing_count: 200, average_price: 300000},
    pagination: {limit: 20, offset: 40, returned: 20},
    listings: Array.from({length: 20}, (_, listingIndex) => ({
      id: 41 + listingIndex, vote_score: listingIndex % 2, comment_count: 3,
      photos: Array.from({length: 4}, (_, position) => ({position, url: `https://images/${position}`})),
      comments: Array.from({length: 3}, (_, commentIndex) => ({id: listingIndex * 3 + commentIndex + 1, vote_score: 0}))
    }))
  }
}

const request = {url: '/api/v1/zip-codes/46201/listings?limit=20&offset=40'}
test('request processor restores ZIP leading zeroes lost by CSV numeric inference', () => {
  const params = {url: '/api/v1/zip-codes/1/listings?limit=20&offset=0'}
  const context = {vars: {zip_code: 1, offset: 0}}
  let error
  prepareZellitRequest(params, context, {}, (value) => { error = value })
  assert.equal(error, undefined)
  assert.equal(context.vars.zip_code, '00001')
  assert.equal(params.url, '/api/v1/zip-codes/00001/listings?limit=20&offset=0')
})

test('processor accepts a complete ordered response', () => {
  assert.doesNotThrow(() => validateZellitResponse(request, {statusCode: 200, body: JSON.stringify(payload())}, {}))
})

for (const [name, mutate] of [
  ['non-200', (_p, response) => { response.statusCode = 500 }],
  ['wrong ZIP', (p) => { p.zip_code.code = '00000' }],
  ['wrong pagination', (p) => { p.pagination.offset = 20 }],
  ['wrong listing cardinality', (p) => { p.listings.pop() }],
  ['wrong photo cardinality', (p) => { p.listings[0].photos.pop() }],
  ['wrong comment cardinality', (p) => { p.listings[0].comments.pop() }],
  ['non-integer score', (p) => { p.listings[0].vote_score = 1.5 }],
  ['unordered listings', (p) => { p.listings[1].id = p.listings[0].id }]
]) {
  test(`processor rejects ${name}`, () => {
    const body = payload(); const response = {statusCode: 200, body: ''}; mutate(body, response); response.body ||= JSON.stringify(body)
    assert.throws(() => validateZellitResponse(request, response, {}), /Invalid Zellit response/)
  })
}

test('processor rejects malformed JSON and emits a dedicated counter', () => {
  const events = []; let callbackError
  assertZellitResponse(request, {statusCode: 200, body: '{'}, {}, {emit: (...args) => events.push(args)}, (error) => { callbackError = error })
  assert(callbackError)
  assert.deepEqual(events, [['counter', 'zellit.invalid_response', 1]])
})

test('metadata contract includes finalized state and reproducibility sections', () => {
  const value = normalizeMetadata({
    run_id: 'run-1', started_at: 'now', completed_at: null, status: 'running', exit_status: null,
    profile: 'smoke', target: 'http://api:8000', execution_mode: 'compose', git_revision: 'abc',
    alphakit_revision: 'def', implementation: 'django-zellit', dataset: {}, request_corpus: {},
    effective_phases: [], versions: {}, images: {}, resource_limits: null, notes: ''
  })
  assert.equal(value.status, 'running')
})

test('run script arms metadata finalization before rendering', async () => {
  const source = await readFile(path.join(benchmarkDir, 'scripts/run.sh'), 'utf8')
  assert(source.indexOf('trap on_exit EXIT') < source.indexOf('render-config.mjs'))
  assert(source.indexOf('write_metadata running') < source.indexOf('render-config.mjs'))
})

test('framework Compose runners remain independently wired', async () => {
  const fastapiRunner = await readFile(path.join(benchmarkDir, 'scripts/run-fastapi-compose.sh'), 'utf8')
  const djangoRunner = await readFile(path.join(benchmarkDir, 'scripts/run-compose.sh'), 'utf8')
  assert.match(fastapiRunner, /research\/demo\/fastapi\/zellit/)
  assert.match(fastapiRunner, /implementation: 'fastapi-zellit'/)
  assert.match(fastapiRunner, /render-fastapi-runtime\.mjs/)
  assert.match(fastapiRunner, /http:\/\/api:8000/)
  assert.doesNotMatch(fastapiRunner, /render-runtime\.mjs/)
  assert.match(djangoRunner, /research\/demo\/django\/zellit/)
})

test('unsafe and existing run IDs fail without overwriting results', async () => {
  const results = await mkdtemp(path.join(os.tmpdir(), 'zellit-results-'))
  const script = path.join(benchmarkDir, 'scripts/run.sh')
  let result = spawnSync('bash', [script, 'smoke', 'http://api:8000'], {env: {...process.env, RESULTS_DIR: results, RUN_ID: '../bad'}, encoding: 'utf8'})
  assert.notEqual(result.status, 0)
  await mkdir(path.join(results, 'existing'))
  result = spawnSync('bash', [script, 'smoke', 'http://api:8000'], {env: {...process.env, RESULTS_DIR: results, RUN_ID: 'existing'}, encoding: 'utf8'})
  assert.notEqual(result.status, 0)
})

test('host runs require explicit complete identity and normalized runtime metadata', async () => {
  const results = await mkdtemp(path.join(os.tmpdir(), 'zellit-host-results-'))
  const script = path.join(benchmarkDir, 'scripts/run.sh')
  const metadata = JSON.stringify({
    git_revision: 'abc', alphakit_revision: 'def', implementation: 'django-zellit',
    dataset: {digest: 'digest'}, request_corpus: {sha256: 'sha'},
    versions: {python: '3.12.12'}, images: {django: 'image'}
  })
  let result = spawnSync('bash', [script, 'smoke', 'http://api:8000'], {
    env: {...process.env, RESULTS_DIR: results, RUN_ID: 'missing-runtime', RUN_METADATA_JSON: metadata}, encoding: 'utf8'
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /RUNTIME_JSON/)

  result = spawnSync('bash', [script, 'smoke', 'http://api:8000'], {
    env: {...process.env, RESULTS_DIR: results, RUN_ID: 'empty-components', RUNTIME_JSON_VALUE: '{}',
      RUN_METADATA_JSON: JSON.stringify({...JSON.parse(metadata), versions: {}})}, encoding: 'utf8'
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /versions/)
})
