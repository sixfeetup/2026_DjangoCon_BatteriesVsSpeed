import assert from 'node:assert/strict'
import {mkdtemp, readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

import {renderFastapiRuntime} from '../scripts/render-fastapi-runtime.mjs'

const benchmarkDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('FastAPI runtime identity is fixed and complete', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fastapi-runtime-'))
  const output = path.join(directory, 'runtime.json')
  const value = await renderFastapiRuntime(output)
  assert.deepEqual(value, {
    runtime_label: 'uvicorn-1',
    server: 'uvicorn',
    workers: 1,
    concurrency_model: 'asyncio',
    database_access: 'sqlalchemy-async',
    database_driver: 'asyncpg',
    pool_size: 20,
    max_overflow: 0,
  })
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), value)
})

test('FastAPI runner rejects missing profile before Docker', () => {
  const script = path.join(benchmarkDir, 'scripts/run-fastapi-compose.sh')
  const result = spawnSync('bash', [script], {encoding: 'utf8'})
  assert.equal(result.status, 2)
  assert.match(result.stderr, /Usage:/)
})

test('FastAPI runner guards overload before Docker', () => {
  const script = path.join(benchmarkDir, 'scripts/run-fastapi-compose.sh')
  const result = spawnSync('bash', [script, 'overload'], {encoding: 'utf8'})
  assert.equal(result.status, 2)
  assert.match(result.stderr, /ENABLE_OVERLOAD=1/)
})
