import assert from 'node:assert/strict'
import {mkdtemp, mkdir, rm, utimes, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {createReportServer, findLatestReport, resolveServerConfig} from '../scripts/serve-report.mjs'

async function createTempDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zellit-serve-report-'))
  t.after(async () => {
    await rm(directory, {recursive: true, force: true})
  })
  return directory
}

async function writeReportEntry(directory, name, mtime) {
  const filePath = path.join(directory, name)
  await writeFile(filePath, `<html><body>${name}</body></html>`, 'utf8')
  await utimes(filePath, mtime, mtime)
  return filePath
}

test('findLatestReport returns an absolute path for the newest matching HTML report', async (t) => {
  const reportsDirectory = await createTempDirectory(t)
  const early = new Date('2026-08-22T12:00:00.000Z')
  const latest = new Date('2026-08-22T12:10:00.000Z')

  await writeReportEntry(reportsDirectory, 'fastapi-zellit-alpha.html', early)
  await writeReportEntry(reportsDirectory, 'notes.html', new Date('2026-08-22T12:20:00.000Z'))
  const ignoredDirectory = path.join(reportsDirectory, 'fastapi-zellit-directory.html')
  const ignoredDirectoryTime = new Date('2026-08-22T12:30:00.000Z')
  await mkdir(ignoredDirectory)
  await utimes(ignoredDirectory, ignoredDirectoryTime, ignoredDirectoryTime)
  const expected = await writeReportEntry(reportsDirectory, 'fastapi-zellit-omega.html', latest)

  const actual = await findLatestReport(reportsDirectory)

  assert.equal(actual, path.resolve(expected))
  assert.equal(path.isAbsolute(actual), true)
})

test('findLatestReport breaks equal mtime ties by lexicographically greatest filename', async (t) => {
  const reportsDirectory = await createTempDirectory(t)
  const sameTime = new Date('2026-08-22T13:00:00.000Z')

  await writeReportEntry(reportsDirectory, 'fastapi-zellit-alpha.html', sameTime)
  const expected = await writeReportEntry(reportsDirectory, 'fastapi-zellit-zulu.html', sameTime)

  const actual = await findLatestReport(reportsDirectory)

  assert.equal(actual, path.resolve(expected))
})

test('findLatestReport rejects an empty reports directory with its absolute path', async (t) => {
  const reportsDirectory = await createTempDirectory(t)

  await assert.rejects(findLatestReport(reportsDirectory), {
    message: `No FastAPI Zellit HTML reports found in ${path.resolve(reportsDirectory)}`
  })
})

test('resolveServerConfig returns defaults and accepts explicit overrides', () => {
  assert.deepEqual(resolveServerConfig({}), {host: '0.0.0.0', port: 4173})
  assert.deepEqual(resolveServerConfig({REPORT_HOST: '127.0.0.1', REPORT_PORT: '9000'}), {
    host: '127.0.0.1',
    port: 9000
  })
})

test('resolveServerConfig rejects invalid REPORT_PORT and REPORT_HOST values', () => {
  for (const value of ['', '0', '65536', '1.5', 'abc', ' 4173']) {
    assert.throws(() => resolveServerConfig({REPORT_PORT: value}), /REPORT_PORT/)
  }
  assert.throws(() => resolveServerConfig({REPORT_HOST: ''}), /REPORT_HOST/)
})

test('createReportServer serves the current HTML report for GET, HEAD, and empty-query root requests', async (t) => {
  const reportsDirectory = await createTempDirectory(t)
  const reportPath = path.join(reportsDirectory, 'fastapi-zellit-live.html')
  const initialHtml = '<!doctype html><html><body>initial</body></html>\n'
  const updatedHtml = '<!doctype html><html><body>updated now</body></html>\n'
  await writeFile(reportPath, initialHtml, 'utf8')

  const {baseUrl} = await startServer(t, createReportServer(reportPath))

  const getResponse = await fetch(`${baseUrl}/`)
  assert.equal(getResponse.status, 200)
  assert.equal(getResponse.headers.get('content-type'), 'text/html; charset=utf-8')
  assert.equal(getResponse.headers.get('content-length'), String(Buffer.byteLength(initialHtml)))
  assert.equal(getResponse.headers.get('cache-control'), 'no-store')
  assert.equal(getResponse.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(await getResponse.text(), initialHtml)

  const headResponse = await fetch(`${baseUrl}/`, {method: 'HEAD'})
  assert.equal(headResponse.status, 200)
  assert.equal(headResponse.headers.get('content-type'), 'text/html; charset=utf-8')
  assert.equal(headResponse.headers.get('content-length'), String(Buffer.byteLength(initialHtml)))
  assert.equal(await headResponse.text(), '')

  const emptyQueryResponse = await fetch(`${baseUrl}/?`)
  assert.equal(emptyQueryResponse.status, 200)
  assert.equal(await emptyQueryResponse.text(), initialHtml)

  await writeFile(reportPath, updatedHtml, 'utf8')
  const updatedResponse = await fetch(`${baseUrl}/`)
  assert.equal(updatedResponse.status, 200)
  assert.equal(updatedResponse.headers.get('content-length'), String(Buffer.byteLength(updatedHtml)))
  assert.equal(await updatedResponse.text(), updatedHtml)
})

test('createReportServer rejects non-root paths, query-bearing root requests, and unsupported methods', async (t) => {
  const reportsDirectory = await createTempDirectory(t)
  const reportPath = path.join(reportsDirectory, 'fastapi-zellit-live.html')
  await writeFile(reportPath, '<html><body>ok</body></html>\n', 'utf8')

  const {baseUrl} = await startServer(t, createReportServer(reportPath))

  const rawResponse = await fetch(`${baseUrl}/raw.json`)
  assert.equal(rawResponse.status, 404)

  const queryResponse = await fetch(`${baseUrl}/?path=other`)
  assert.equal(queryResponse.status, 404)

  const postResponse = await fetch(`${baseUrl}/`, {method: 'POST'})
  assert.equal(postResponse.status, 405)
  assert.equal(postResponse.headers.get('allow'), 'GET, HEAD')
})

test('createReportServer returns a generic 500 and logs report read failures', async (t) => {
  const reportsDirectory = await createTempDirectory(t)
  const reportPath = path.join(reportsDirectory, 'fastapi-zellit-live.html')
  await writeFile(reportPath, '<html><body>ok</body></html>\n', 'utf8')
  const errors = []
  const logger = {
    error(...args) {
      errors.push(args)
    }
  }

  const {baseUrl} = await startServer(t, createReportServer(reportPath, {logger}))

  await rm(reportPath)
  const response = await fetch(`${baseUrl}/`)
  const body = await response.text()

  assert.equal(response.status, 500)
  assert.match(body, /Internal Server Error/i)
  assert.doesNotMatch(body, new RegExp(escapeRegExp(reportPath)))
  assert.equal(errors.length, 1)
  const logged = errors.flat().map((value) => String(value)).join(' ')
  assert.match(logged, /ENOENT|no such file/i)
  assert.match(logged, new RegExp(escapeRegExp(reportPath)))
})

async function startServer(t, server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  })
  const address = server.address()
  return {baseUrl: `http://127.0.0.1:${address.port}`}
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
