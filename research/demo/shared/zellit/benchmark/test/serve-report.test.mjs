import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {mkdtemp, mkdir, readFile, rm, utimes, writeFile} from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildStartupLines,
  createReportServer,
  findLatestReport,
  installShutdownHandlers,
  listen,
  main,
  resolveServerConfig
} from '../scripts/serve-report.mjs'

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

test('buildStartupLines lists sorted unique external IPv4 addresses for an all-interface host', () => {
  const reportPath = path.resolve('/tmp/fastapi-zellit-current.html')
  const networkInterfaces = {
    lo: [
      {address: '127.0.0.1', family: 'IPv4', internal: true},
      {address: '::1', family: 'IPv6', internal: true}
    ],
    ethernet: [
      {address: '192.168.1.20', family: 'IPv4', internal: false},
      {address: 'fe80::1234', family: 'IPv6', internal: false}
    ],
    wifi: [
      {address: '192.168.1.20', family: 'IPv4', internal: false},
      {address: '10.0.0.8', family: 'IPv4', internal: false}
    ]
  }

  assert.deepEqual(buildStartupLines({reportPath, host: '0.0.0.0', port: 4173, networkInterfaces}), [
    `Serving report: ${reportPath}`,
    'Local: http://localhost:4173/',
    'LAN: http://10.0.0.8:4173/',
    'LAN: http://192.168.1.20:4173/',
    'Warning: this report is exposed to devices on your local network.'
  ])
})

test('buildStartupLines emits only a local URL for a loopback host', () => {
  const lines = buildStartupLines({
    reportPath: '/tmp/fastapi-zellit-current.html',
    host: '127.0.0.1',
    port: 4173,
    networkInterfaces: {}
  })

  assert.deepEqual(lines, [
    `Serving report: ${path.resolve('/tmp/fastapi-zellit-current.html')}`,
    'Local: http://127.0.0.1:4173/'
  ])
})

test('buildStartupLines emits a warning for a configured non-loopback host and brackets IPv6', () => {
  assert.deepEqual(buildStartupLines({
    reportPath: '/tmp/fastapi-zellit-current.html',
    host: '192.168.1.40',
    port: 4173,
    networkInterfaces: {}
  }), [
    `Serving report: ${path.resolve('/tmp/fastapi-zellit-current.html')}`,
    'LAN: http://192.168.1.40:4173/',
    'Warning: this report is exposed to devices on your local network.'
  ])

  assert.deepEqual(buildStartupLines({
    reportPath: '/tmp/fastapi-zellit-current.html',
    host: '2001:db8::20',
    port: 4173,
    networkInterfaces: {}
  }), [
    `Serving report: ${path.resolve('/tmp/fastapi-zellit-current.html')}`,
    'LAN: http://[2001:db8::20]:4173/',
    'Warning: this report is exposed to devices on your local network.'
  ])
})

test('listen rejects listener errors and removes the opposite event handler', async (t) => {
  const occupiedServer = http.createServer()
  await listen(occupiedServer, {host: '127.0.0.1', port: 0})
  t.after(() => closeServer(occupiedServer))
  const address = occupiedServer.address()

  const conflictingServer = http.createServer()
  await assert.rejects(
    listen(conflictingServer, {host: '127.0.0.1', port: address.port}),
    (error) => error.code === 'EADDRINUSE'
  )
  assert.equal(conflictingServer.listenerCount('error'), 0)
})

test('listen removes its one-time event handlers after either settlement', async () => {
  const expectedError = new Error('listen failed')
  const failingServer = new EventEmitter()
  failingServer.listen = () => failingServer.emit('error', expectedError)
  await assert.rejects(listen(failingServer, {host: '127.0.0.1', port: 4173}), expectedError)
  assert.equal(failingServer.listenerCount('listening'), 0)
  assert.equal(failingServer.listenerCount('error'), 0)

  const successfulServer = new EventEmitter()
  successfulServer.listen = () => successfulServer.emit('listening')
  await listen(successfulServer, {host: '127.0.0.1', port: 4173})
  assert.equal(successfulServer.listenerCount('listening'), 0)
  assert.equal(successfulServer.listenerCount('error'), 0)
})

test('installShutdownHandlers closes once, exits successfully, and removes signal handlers', () => {
  const processLike = createFakeProcess()
  let closeCalls = 0
  const server = {
    close(callback) {
      closeCalls += 1
      callback()
    }
  }

  const cleanup = installShutdownHandlers(server, processLike)
  assert.equal(processLike.listenerCount('SIGINT'), 1)
  assert.equal(processLike.listenerCount('SIGTERM'), 1)

  processLike.emit('SIGINT')
  processLike.emit('SIGTERM')

  assert.equal(closeCalls, 1)
  assert.deepEqual(processLike.exits, [0])
  assert.equal(processLike.listenerCount('SIGINT'), 0)
  assert.equal(processLike.listenerCount('SIGTERM'), 0)
  cleanup()
})

test('installShutdownHandlers reports close failures and cleanup can remove handlers', () => {
  const processLike = createFakeProcess()
  const server = {
    close(callback) {
      callback(new Error('close failed'))
    }
  }

  const cleanup = installShutdownHandlers(server, processLike)
  cleanup()
  assert.equal(processLike.listenerCount('SIGINT'), 0)
  assert.equal(processLike.listenerCount('SIGTERM'), 0)

  installShutdownHandlers(server, processLike)
  processLike.emit('SIGTERM')
  assert.equal(processLike.stderr.output, 'Could not close report server: close failed\n')
  assert.deepEqual(processLike.exits, [1])
})

test('installShutdownHandlers keeps both handlers until an asynchronous close finishes', () => {
  const processLike = createFakeProcess()
  let closeCalls = 0
  let completeClose
  const server = {
    close(callback) {
      closeCalls += 1
      completeClose = callback
    }
  }

  installShutdownHandlers(server, processLike)
  processLike.emit('SIGTERM')
  processLike.emit('SIGTERM')

  assert.equal(closeCalls, 1)
  assert.deepEqual(processLike.exits, [])
  assert.equal(processLike.listenerCount('SIGINT'), 1)
  assert.equal(processLike.listenerCount('SIGTERM'), 1)

  completeClose()

  assert.deepEqual(processLike.exits, [0])
  assert.equal(processLike.listenerCount('SIGINT'), 0)
  assert.equal(processLike.listenerCount('SIGTERM'), 0)
})

test("installShutdownHandlers monitors its initial parent with bounded unref'd polling", () => {
  for (const parentFailure of ['disappeared', 'reparented']) {
    const initialParentPid = 4321
    const processLike = createFakeProcess()
    processLike.ppid = initialParentPid
    let parentAlive = true
    let closeCalls = 0
    let poll
    let pollInterval
    let unrefCalls = 0
    let clearCalls = 0
    const timer = {
      unref() {
        unrefCalls += 1
      }
    }
    const server = {
      close(callback) {
        closeCalls += 1
        callback()
      }
    }

    installShutdownHandlers(server, processLike, {
      isProcessAlive(pid) {
        assert.equal(pid, initialParentPid)
        return parentAlive
      },
      setInterval(callback, interval) {
        poll = callback
        pollInterval = interval
        return timer
      },
      clearInterval(actualTimer) {
        assert.equal(actualTimer, timer)
        clearCalls += 1
      }
    })

    assert.equal(typeof poll, 'function')
    assert.ok(pollInterval > 0 && pollInterval <= 1000)
    assert.equal(unrefCalls, 1)

    poll()
    assert.equal(closeCalls, 0)

    if (parentFailure === 'disappeared') parentAlive = false
    else processLike.ppid = initialParentPid + 1
    poll()

    assert.equal(closeCalls, 1)
    assert.deepEqual(processLike.exits, [0])
    assert.equal(clearCalls, 1)
    assert.equal(processLike.listenerCount('SIGINT'), 0)
    assert.equal(processLike.listenerCount('SIGTERM'), 0)
  }
})

test('package.json contains the exact report:serve task', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(packageJson.scripts['report:serve'], 'node scripts/serve-report.mjs')
})

test('main reports startup failures once and sets exitCode', async (t) => {
  const reportsDirectory = await createTempDirectory(t)
  const stdout = createOutput()
  const stderr = createOutput()
  const processLike = createFakeProcess(stderr)

  const server = await main({reportsDirectory, env: {}, stdout, stderr, processLike})

  assert.equal(server, null)
  assert.equal(stdout.output, '')
  assert.equal(
    stderr.output,
    `Could not start report server: No FastAPI Zellit HTML reports found in ${path.resolve(reportsDirectory)}\n`
  )
  assert.equal(processLike.exitCode, 1)
})

test('main closes a successful listener before reporting a later startup failure', async (t) => {
  const reportsDirectory = await createTempDirectory(t)
  await writeReportEntry(
    reportsDirectory,
    'fastapi-zellit-main.html',
    new Date('2026-08-22T14:00:00.000Z')
  )
  const events = []
  const stderr = {
    output: '',
    write(value) {
      events.push('stderr')
      this.output += String(value)
    }
  }
  const processLike = createFakeProcess(stderr)
  const fakeServer = new EventEmitter()
  let closeCalls = 0
  fakeServer.listen = () => {
    fakeServer.emit('listening')
  }
  fakeServer.close = (callback) => {
    events.push('close')
    closeCalls += 1
    callback()
  }

  const server = await main({
    reportsDirectory,
    env: {REPORT_HOST: 'report-server.invalid', REPORT_PORT: '4173'},
    stdout: {
      write() {
        events.push('stdout')
        throw new Error('startup output failed')
      }
    },
    stderr,
    processLike,
    createServer() {
      return fakeServer
    }
  })

  assert.equal(server, null)
  assert.equal(closeCalls, 1)
  assert.deepEqual(events, ['stdout', 'close', 'stderr'])
  assert.equal(stderr.output, 'Could not start report server: startup output failed\n')
  assert.equal(processLike.exitCode, 1)
})

test('main starts the selected report and prints its path, URL, and warning', async (t) => {
  const reportsDirectory = await createTempDirectory(t)
  const reportPath = await writeReportEntry(
    reportsDirectory,
    'fastapi-zellit-main.html',
    new Date('2026-08-22T14:00:00.000Z')
  )
  const port = await findAvailablePort()
  const stdout = createOutput()
  const stderr = createOutput()
  const processLike = createFakeProcess(stderr)

  const server = await main({
    reportsDirectory,
    env: {REPORT_HOST: '0.0.0.0', REPORT_PORT: String(port)},
    stdout,
    stderr,
    processLike
  })
  t.after(() => closeServer(server))

  assert.ok(server)
  assert.match(stdout.output, new RegExp(`Serving report: ${escapeRegExp(path.resolve(reportPath))}`))
  assert.match(stdout.output, new RegExp(`Local: http://localhost:${port}/`))
  assert.match(stdout.output, /Warning: this report is exposed to devices on your local network\./)
  assert.equal(stderr.output, '')
  assert.notEqual(processLike.exitCode, 1)

  const response = await fetch(`http://127.0.0.1:${port}/`)
  assert.equal(response.status, 200)
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

async function findAvailablePort() {
  const server = http.createServer()
  await listen(server, {host: '127.0.0.1', port: 0})
  const {port} = server.address()
  await closeServer(server)
  return port
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function createOutput() {
  return {
    output: '',
    write(value) {
      this.output += String(value)
    }
  }
}

function createFakeProcess(stderr = createOutput()) {
  const processLike = new EventEmitter()
  processLike.stderr = stderr
  processLike.exits = []
  processLike.exit = (code) => {
    processLike.exits.push(code)
  }
  return processLike
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
