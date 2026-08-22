import http from 'node:http'
import {readdir, readFile, stat} from 'node:fs/promises'
import path from 'node:path'

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
