import assert from 'node:assert/strict'
import {mkdtemp, readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {renderRuntime} from '../scripts/render-runtime.mjs'

async function render(mode, env = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zellit-runtime-test-'))
  const envPath = path.join(directory, 'runtime.env')
  const jsonPath = path.join(directory, 'runtime.json')
  const value = await renderRuntime(mode, envPath, jsonPath, env)
  return {value, env: await readFile(envPath, 'utf8')}
}

test('gevent-1 uses the exact normalized Django runtime contract', async () => {
  const {value, env} = await render('gevent-1')
  assert.equal(value.runtime_label, 'gevent-1')
  assert.equal(value.worker_class, 'gevent')
  assert.equal(value.workers, 1)
  assert.equal(value.database_mode, 'geventpool')
  assert.equal(value.gevent_pool_max, 20)
  assert.equal(value.worker_connections, 10000)
  assert.match(env, /DJANGO_DATABASE_MODE=geventpool/)
})

test('sync-1 uses the exact normalized Django runtime contract', async () => {
  const {value} = await render('sync-1')
  assert.equal(value.runtime_label, 'sync-1')
  assert.equal(value.worker_class, 'sync')
  assert.equal(value.workers, 1)
  assert.equal(value.database_mode, 'standard')
  assert.equal(value.conn_max_age, 60)
})

test('runtime preset overrides remain normalized by the shared Django implementation', async () => {
  const {value} = await render('sync-1', {GUNICORN_WORKERS: '3', GUNICORN_THREADS: '2'})
  assert.equal(value.workers, 3)
  assert.equal(value.threads, 2)
})

test('custom runtime requires a safe label and required modes', async () => {
  await assert.rejects(render('custom'), /RUNTIME_LABEL|runtime label/)
  await assert.rejects(render('custom', {RUNTIME_LABEL: '../bad', DJANGO_DATABASE_MODE: 'standard', GUNICORN_WORKER_CLASS: 'sync'}), /runtime label/)
  const {value} = await render('custom', {RUNTIME_LABEL: 'sync-4', DJANGO_DATABASE_MODE: 'standard', GUNICORN_WORKER_CLASS: 'sync', GUNICORN_WORKERS: '4'})
  assert.equal(value.runtime_label, 'sync-4')
  assert.equal(value.preset, 'custom')
  assert.equal(value.workers, 4)
})

test('unknown and invalid runtimes fail before application startup', async () => {
  await assert.rejects(render('unknown'), /unknown runtime preset/)
  await assert.rejects(render('sync-1', {GUNICORN_WORKERS: '0'}), /workers must be between/)
  await assert.rejects(render('sync-1', {DJANGO_DATABASE_MODE: 'geventpool'}), /selected together/)
})
