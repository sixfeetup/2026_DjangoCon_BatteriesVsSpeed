import http from 'node:http'
import {readdir, readFile, stat} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const reportPattern = /^fastapi-zellit-.*\.html$/

export async function findLatestReport(reportsDirectory) {
  const resolvedDirectory = path.resolve(reportsDirectory)
  const entries = await readdir(resolvedDirectory, {withFileTypes: true})
  const candidates = await Promise.all(entries
    .filter((entry) => entry.isFile() && reportPattern.test(entry.name))
    .map(async (entry) => {
      const absolutePath = path.resolve(resolvedDirectory, entry.name)
      const details = await stat(absolutePath)
      return {absolutePath, name: entry.name, mtimeMs: details.mtimeMs}
    }))

  candidates.sort((left, right) => {
    if (right.mtimeMs !== left.mtimeMs) return right.mtimeMs - left.mtimeMs
    if (left.name < right.name) return 1
    if (left.name > right.name) return -1
    return 0
  })

  if (candidates.length === 0) {
    throw new Error(`No FastAPI Zellit HTML reports found in ${resolvedDirectory}`)
  }

  return candidates[0].absolutePath
}

export function resolveServerConfig(env = process.env) {
  const host = resolveHost(env.REPORT_HOST)
  const port = resolvePort(env.REPORT_PORT)
  return {host, port}
}

export function buildStartupLines({reportPath, host, port, networkInterfaces = os.networkInterfaces()}) {
  const lines = [`Serving report: ${path.resolve(reportPath)}`]

  if (isAllInterfaces(host)) {
    lines.push(`Local: http://localhost:${port}/`)
    const addresses = new Set()
    for (const entries of Object.values(networkInterfaces ?? {})) {
      for (const entry of entries ?? []) {
        if (!entry.internal && (entry.family === 'IPv4' || entry.family === 4)) {
          addresses.add(entry.address)
        }
      }
    }
    for (const address of [...addresses].sort()) {
      lines.push(`LAN: ${formatUrl(address, port)}`)
    }
    lines.push('Warning: this report is exposed to devices on your local network.')
    return lines
  }

  const label = isLoopback(host) ? 'Local' : 'LAN'
  lines.push(`${label}: ${formatUrl(host, port)}`)
  if (label === 'LAN') {
    lines.push('Warning: this report is exposed to devices on your local network.')
  }
  return lines
}

export function listen(server, {host, port}) {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    const onError = (error) => {
      server.off('listening', onListening)
      reject(error)
    }

    server.once('listening', onListening)
    server.once('error', onError)
    try {
      server.listen(port, host)
    } catch (error) {
      server.off('listening', onListening)
      server.off('error', onError)
      reject(error)
    }
  })
}

export function installShutdownHandlers(server, processLike = process) {
  let shuttingDown = false

  const cleanup = () => {
    processLike.off('SIGINT', shutdown)
    processLike.off('SIGTERM', shutdown)
  }
  const finish = (error) => {
    if (error) {
      processLike.stderr?.write(`Could not close report server: ${error.message}\n`)
    }
    const exitCode = error ? 1 : 0
    if (typeof processLike.exit === 'function') processLike.exit(exitCode)
    else processLike.exitCode = exitCode
  }
  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    cleanup()
    try {
      server.close(finish)
    } catch (error) {
      finish(error)
    }
  }

  processLike.once('SIGINT', shutdown)
  processLike.once('SIGTERM', shutdown)
  return cleanup
}

export async function main({
  reportsDirectory = defaultReportsDirectory(),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  processLike = process
} = {}) {
  try {
    const config = resolveServerConfig(env)
    const reportPath = await findLatestReport(reportsDirectory)
    const server = createReportServer(reportPath, {
      logger: {
        error(message) {
          stderr.write(`${message}\n`)
        }
      }
    })

    await listen(server, config)
    for (const line of buildStartupLines({reportPath, ...config})) {
      stdout.write(`${line}\n`)
    }
    installShutdownHandlers(server, processLike)
    return server
  } catch (error) {
    stderr.write(`Could not start report server: ${error.message}\n`)
    processLike.exitCode = 1
    return null
  }
}

export function createReportServer(reportPath, options = {}) {
  const logger = options.logger ?? console
  const resolvedReportPath = path.resolve(reportPath)

  return http.createServer(async (request, response) => {
    const requestUrl = request.url ?? '/'
    const pathname = new URL(requestUrl, 'http://localhost').pathname

    if (!isAllowedRootRequest(requestUrl, pathname)) {
      sendText(response, 404, 'Not Found')
      return
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD')
      sendText(response, 405, 'Method Not Allowed')
      return
    }

    try {
      const report = await readFile(resolvedReportPath)
      const headers = {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': String(report.byteLength),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      }
      response.writeHead(200, headers)
      if (request.method === 'HEAD') {
        response.end()
        return
      }
      response.end(report)
    } catch (error) {
      logger.error?.(`Failed to read report at ${resolvedReportPath}: ${error.message}`)
      sendText(response, 500, 'Internal Server Error')
    }
  })
}

function isAllowedRootRequest(requestUrl, pathname) {
  return pathname === '/' && (requestUrl === '/' || requestUrl === '/?')
}

function sendText(response, statusCode, body) {
  const payload = `${body}\n`
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': String(Buffer.byteLength(payload))
  })
  response.end(payload)
}

function defaultReportsDirectory() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
  const repositoryRoot = path.resolve(scriptDirectory, '../../../../../..')
  return path.join(repositoryRoot, 'research', 'reports')
}

function formatUrl(host, port) {
  const formattedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return `http://${formattedHost}:${port}/`
}

function isAllInterfaces(host) {
  return host === '0.0.0.0' || host === '::'
}

function isLoopback(host) {
  return host === 'localhost' || host === '::1' || /^127(?:\.|$)/.test(host)
}

function resolveHost(value) {
  if (value === undefined) return '0.0.0.0'
  if (typeof value !== 'string' || value === '') throw new Error('REPORT_HOST must be a non-empty string')
  return value
}

function resolvePort(value) {
  if (value === undefined) return 4173
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) throw new Error('REPORT_PORT must be a whole-number string between 1 and 65535')
  const port = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('REPORT_PORT must be a whole-number string between 1 and 65535')
  }
  return port
}

function isDirectExecution() {
  return process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
}

if (isDirectExecution()) {
  await main()
}
