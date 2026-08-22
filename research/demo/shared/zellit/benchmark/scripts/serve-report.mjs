import {constants as fsConstants, readFileSync} from 'node:fs'
import {lstat, open, readdir} from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const reportPattern = /^fastapi-zellit-.*\.html$/
const parentPollIntervalMs = 250
const startupLauncherIdentity = captureLauncherIdentity()

export async function findLatestReport(reportsDirectory) {
  const resolvedDirectory = path.resolve(reportsDirectory)
  const entries = await readdir(resolvedDirectory, {withFileTypes: true})
  const candidates = (await Promise.all(entries
    .filter((entry) => entry.isFile() && reportPattern.test(entry.name))
    .map(async (entry) => {
      const absolutePath = path.resolve(resolvedDirectory, entry.name)
      const details = await lstat(absolutePath)
      if (!details.isFile()) return null
      return {absolutePath, name: entry.name, mtimeMs: details.mtimeMs}
    }))).filter((candidate) => candidate !== null)

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

export function installShutdownHandlers(server, processLike = process, monitorOptions = {}) {
  let shuttingDown = false
  let finished = false
  let cleanupParentMonitor = () => {}

  const cleanup = () => {
    processLike.off('SIGINT', shutdown)
    processLike.off('SIGTERM', shutdown)
    cleanupParentMonitor()
  }
  const finish = (error) => {
    if (finished) return
    finished = true
    cleanup()
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
    try {
      server.close(finish)
    } catch (error) {
      finish(error)
    }
  }

  try {
    processLike.on('SIGINT', shutdown)
    processLike.on('SIGTERM', shutdown)
    cleanupParentMonitor = installParentMonitor(shutdown, processLike, monitorOptions)
  } catch (error) {
    cleanup()
    throw error
  }
  return cleanup
}

export async function main({
  reportsDirectory = defaultReportsDirectory(),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  processLike = process,
  createServer = createReportServer,
  launcherIdentity = startupLauncherIdentity
} = {}) {
  let server = null
  let listening = false
  let cleanupShutdownHandlers = () => {}

  try {
    const config = resolveServerConfig(env)
    const reportPath = await findLatestReport(reportsDirectory)
    server = createServer(reportPath, {
      logger: {
        error(message) {
          stderr.write(`${message}\n`)
        }
      }
    })

    await listen(server, config)
    listening = true
    cleanupShutdownHandlers = installShutdownHandlers(server, processLike, {launcherIdentity})
    for (const line of buildStartupLines({reportPath, ...config})) {
      stdout.write(`${line}\n`)
    }
    return server
  } catch (error) {
    cleanupShutdownHandlers()
    let startupError = error
    if (listening) {
      try {
        await closeListener(server)
      } catch (closeError) {
        startupError = new Error(`${error.message}; could not close listener: ${closeError.message}`)
      }
    }
    stderr.write(`Could not start report server: ${startupError.message}\n`)
    processLike.exitCode = 1
    return null
  }
}

export function createReportServer(reportPath, options = {}) {
  const logger = options.logger ?? console
  const resolvedReportPath = path.resolve(reportPath)

  return http.createServer(async (request, response) => {
    const requestTarget = request.url ?? ''
    if (!isAllowedRootRequest(requestTarget)) {
      sendText(response, 404, 'Not Found')
      return
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD')
      sendText(response, 405, 'Method Not Allowed')
      return
    }

    try {
      const report = await readSelectedRegularFile(resolvedReportPath)
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

function isAllowedRootRequest(requestTarget) {
  return requestTarget === '/' || requestTarget === '/?'
}

async function readSelectedRegularFile(reportPath) {
  const noFollowFlag = fsConstants.O_NOFOLLOW ?? 0
  const handle = await open(reportPath, fsConstants.O_RDONLY | noFollowFlag)
  try {
    const [openedDetails, pathDetails] = await Promise.all([
      handle.stat(),
      lstat(reportPath)
    ])
    if (!openedDetails.isFile() || !pathDetails.isFile()) {
      throw new Error('Selected report path is not a regular file')
    }
    if (openedDetails.dev !== pathDetails.dev || openedDetails.ino !== pathDetails.ino) {
      throw new Error('Selected report path changed while it was being opened')
    }
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}

function sendText(response, statusCode, body) {
  const payload = `${body}\n`
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': String(Buffer.byteLength(payload))
  })
  response.end(payload)
}

function installParentMonitor(shutdown, processLike, options) {
  const launcherIdentity = options.launcherIdentity ?? startupLauncherIdentity
  const hasInjectableLiveness = typeof options.isProcessAlive === 'function'
  if (
    (!hasInjectableLiveness && processLike !== process) ||
    !Number.isInteger(launcherIdentity?.pid) ||
    launcherIdentity.pid <= 1
  ) {
    return () => {}
  }

  const isProcessAlive = options.isProcessAlive ?? defaultProcessIdentityIsAlive
  const setIntervalFn = options.setInterval ?? setInterval
  const clearIntervalFn = options.clearInterval ?? clearInterval
  let active = true
  let timer
  const stop = () => {
    if (!active) return
    active = false
    if (timer !== undefined) clearIntervalFn(timer)
  }
  const poll = () => {
    if (!active) return false

    let launcherAlive = true
    try {
      launcherAlive = isProcessAlive(launcherIdentity)
    } catch {
      return true
    }
    const stillDirectParent = !launcherIdentity.directParent ||
      processLike.ppid === launcherIdentity.pid
    if (stillDirectParent && launcherAlive) return true

    stop()
    shutdown()
    return false
  }

  if (!poll()) return stop
  timer = setIntervalFn(poll, parentPollIntervalMs)
  try {
    timer?.unref?.()
  } catch (error) {
    stop()
    throw error
  }
  return stop
}

function captureLauncherIdentity() {
  const directParentPid = process.ppid
  if (!Number.isInteger(directParentPid) || directParentPid <= 1) return null

  const fallback = {
    pid: directParentPid,
    directParent: true,
    source: 'synchronous-parent'
  }
  if (process.platform !== 'linux') return fallback

  const directParent = readLinuxProcessIdentity(directParentPid)
  if (!directParent) return fallback
  const directIdentity = {
    ...directParent,
    directParent: true,
    source: 'linux-proc-parent'
  }
  if (process.env.npm_lifecycle_event !== 'report:serve') return directIdentity

  const ancestors = [directParent]
  let current = directParent
  for (let depth = 0; depth < 15 && current.ppid > 1; depth += 1) {
    current = readLinuxProcessIdentity(current.ppid)
    if (!current) break
    ancestors.push(current)
  }
  const packageLauncher = ancestors.find(isPnpmLauncher)
  if (!packageLauncher) return directIdentity
  return {
    ...packageLauncher,
    directParent: packageLauncher.pid === directParentPid,
    source: 'linux-proc-pnpm-ancestor'
  }
}

function readLinuxProcessIdentity(pid) {
  try {
    const statContents = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const closingParenthesis = statContents.lastIndexOf(')')
    if (closingParenthesis < 0) return null
    const fields = statContents.slice(closingParenthesis + 2).trim().split(/\s+/)
    const commandContents = readFileSync(`/proc/${pid}/cmdline`)
    return {
      pid,
      ppid: Number.parseInt(fields[1], 10),
      startTime: fields[19],
      argv: commandContents.toString('utf8').split('\0').filter(Boolean)
    }
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return null
    return null
  }
}

function isPnpmLauncher(identity) {
  const basenames = identity.argv.map((argument) => path.basename(argument).toLowerCase())
  const pnpmIndex = basenames.findIndex((name) => name === 'pnpm' || name === 'pnpm.cjs')
  if (pnpmIndex < 0) return false
  return identity.argv.slice(pnpmIndex + 1).includes('report:serve')
}

function defaultProcessIdentityIsAlive(identity) {
  try {
    process.kill(identity.pid, 0)
  } catch (error) {
    return error.code !== 'ESRCH'
  }

  if (process.platform !== 'linux' || identity.startTime === undefined) return true
  const current = readLinuxProcessIdentity(identity.pid)
  return current !== null && current.startTime === identity.startTime
}

function closeListener(server) {
  return new Promise((resolve, reject) => {
    try {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    } catch (error) {
      reject(error)
    }
  })
}

function defaultReportsDirectory() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
  const repositoryRoot = path.resolve(scriptDirectory, '../../../../../..')
  return path.join(repositoryRoot, 'research', 'reports')
}

function formatUrl(host, port) {
  const formattedHost = net.isIP(host) === 6 ? `[${host}]` : host
  return `http://${formattedHost}:${port}/`
}

function isAllInterfaces(host) {
  return classifyHost(host) === 'wildcard'
}

function isLoopback(host) {
  return classifyHost(host) === 'loopback'
}

function classifyHost(host) {
  if (host.toLowerCase() === 'localhost') return 'loopback'
  const family = net.isIP(host)
  if (family === 4) {
    if (host === '0.0.0.0') return 'wildcard'
    return host.startsWith('127.') ? 'loopback' : 'external'
  }
  if (family !== 6) return 'external'

  const canonical = net.SocketAddress.parse(`[${host}]:0`)?.address.toLowerCase()
  if (canonical === '::') return 'wildcard'
  if (canonical === '::1') return 'loopback'
  const mappedIpv4 = canonical?.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  return mappedIpv4 === undefined ? 'external' : classifyHost(mappedIpv4)
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
