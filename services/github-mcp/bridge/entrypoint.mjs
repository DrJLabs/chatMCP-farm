#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createWriteStream } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const port = Number.parseInt(process.env.PORT ?? '9090', 10)
const host = process.env.BRIDGE_HOST ?? '0.0.0.0'
const metricsPort = Number.parseInt(process.env.BRIDGE_METRICS_PORT ?? '9300', 10)
const restartDelayMs = Number.parseInt(process.env.BRIDGE_RESTART_DELAY_MS ?? '2000', 10)
const logDir = resolve(process.env.BRIDGE_LOG_DIR ?? '/var/log/bridge')
const logFileName = process.env.BRIDGE_LOG_FILE_NAME ?? 'bridge.log'
const logPath = join(logDir, logFileName)
const streamEndpoint = process.env.BRIDGE_STREAM_ENDPOINT ?? '/mcp'
const enableDebug = String(process.env.BRIDGE_DEBUG ?? '').toLowerCase() === 'true'
const disableAutoRestart = String(process.env.BRIDGE_DISABLE_RESTART ?? '').toLowerCase() === 'true'

mkdirSync(logDir, { recursive: true })
const logStream = createWriteStream(logPath, { flags: 'a' })

const metrics = {
  startTimeMs: Date.now(),
  restarts: 0,
  stdoutLines: 0,
  stderrLines: 0,
  lastExitCode: null,
  lastExitSignal: null,
  lastExitAt: null,
  lastLogAt: null,
  running: false,
}

function splitArgs(value) {
  return value
    .match(/(?:\\"|[^"'\s]|"[^"]*"|'[^']*')+/g)
    ?.map(token => {
      const trimmed = token.trim()
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1)
      }
      return trimmed
    }) ?? []
}

const serverArgs = process.env.GITHUB_MCP_SERVER_ARGS ? splitArgs(process.env.GITHUB_MCP_SERVER_ARGS) : []

const proxyExecutable = process.env.MCP_PROXY_EXECUTABLE ?? '/usr/local/lib/node_modules/mcp-proxy/dist/bin/mcp-proxy.js'

const proxyArgs = [
  proxyExecutable,
  'github-mcp-server',
  'stdio',
  ...serverArgs,
  '--host', host,
  '--port', String(port),
  '--server', 'stream',
  '--streamEndpoint', streamEndpoint,
]

if (enableDebug) proxyArgs.push('--debug')

let child = null
let restartTimer = null
let shuttingDown = false

function writeLog(source, chunk) {
  metrics.lastLogAt = Date.now()
  const text = chunk.toString()
  const lineCount = text.split(/\r?\n/).filter(Boolean).length
  if (source === 'stdout') metrics.stdoutLines += lineCount
  if (source === 'stderr') metrics.stderrLines += lineCount
  process[source === 'stdout' ? 'stdout' : 'stderr'].write(chunk)
  logStream.write(chunk)
}

function spawnBridge() {
  metrics.running = true
  const childEnv = {
    ...process.env,
  }

  if (!childEnv.GITHUB_PERSONAL_ACCESS_TOKEN) {
    const fallbackPat = childEnv.GITHUB_TOKEN ?? childEnv.GH_TOKEN
    if (fallbackPat) childEnv.GITHUB_PERSONAL_ACCESS_TOKEN = fallbackPat
  }

  const childProcess = spawn('node', proxyArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv,
  })
  child = childProcess
  childProcess.stdout.on('data', data => writeLog('stdout', data))
  childProcess.stderr.on('data', data => writeLog('stderr', data))

  childProcess.on('exit', (code, signal) => {
    metrics.running = false
    metrics.lastExitCode = code
    metrics.lastExitSignal = signal
    metrics.lastExitAt = Date.now()

    if (!shuttingDown) {
      metrics.restarts += 1
      if (!disableAutoRestart) {
        restartTimer = setTimeout(spawnBridge, restartDelayMs)
      }
    }
  })
}

spawnBridge()

const server = createServer((req, res) => {
  if (req.url === '/healthz') {
    const healthy = metrics.running
    res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: healthy,
        running: metrics.running,
        lastExitCode: metrics.lastExitCode,
        lastExitSignal: metrics.lastExitSignal,
        lastExitAt: metrics.lastExitAt,
        lastLogAt: metrics.lastLogAt,
        restarts: metrics.restarts,
        logPath,
      }),
    )
    return
  }

  if (req.url === '/metrics') {
    const uptimeSeconds = (Date.now() - metrics.startTimeMs) / 1000
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' })
    res.end(
      [
        '# HELP bridge_process_up Whether the mcp-proxy process is running (1) or not (0).',
        '# TYPE bridge_process_up gauge',
        `bridge_process_up ${metrics.running ? 1 : 0}`,
        '# HELP bridge_process_restarts_total Number of times the bridge process has restarted.',
        '# TYPE bridge_process_restarts_total counter',
        `bridge_process_restarts_total ${metrics.restarts}`,
        '# HELP bridge_process_start_time_seconds Unix timestamp when the bridge wrapper started.',
        '# TYPE bridge_process_start_time_seconds gauge',
        `bridge_process_start_time_seconds ${Math.floor(metrics.startTimeMs / 1000)}`,
        '# HELP bridge_process_stdout_lines_total Count of stdout log lines observed.',
        '# TYPE bridge_process_stdout_lines_total counter',
        `bridge_process_stdout_lines_total ${metrics.stdoutLines}`,
        '# HELP bridge_process_stderr_lines_total Count of stderr log lines observed.',
        '# TYPE bridge_process_stderr_lines_total counter',
        `bridge_process_stderr_lines_total ${metrics.stderrLines}`,
        '# HELP bridge_process_last_exit_code Last recorded exit code from the child process.',
        '# TYPE bridge_process_last_exit_code gauge',
        `bridge_process_last_exit_code ${metrics.lastExitCode ?? -1}`,
        '# HELP bridge_process_uptime_seconds Wrapper uptime in seconds.',
        '# TYPE bridge_process_uptime_seconds gauge',
        `bridge_process_uptime_seconds ${uptimeSeconds.toFixed(0)}`,
      ].join('\n'),
    )
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('not found')
})

server.listen(metricsPort, host, () => {
  console.log(`bridge metrics listening on http://${host}:${metricsPort}`)
})

function shutdown(code = 0) {
  shuttingDown = true
  if (restartTimer) clearTimeout(restartTimer)
  if (child) {
    child.once('exit', () => {
      server.close(() => {
        logStream.end(() => process.exit(code))
      })
    })
    child.kill('SIGTERM')
    setTimeout(() => {
      server.close(() => {
        logStream.end(() => process.exit(code))
      })
    }, Number.parseInt(process.env.BRIDGE_SHUTDOWN_TIMEOUT_MS ?? '5000', 10))
  } else {
    server.close(() => {
      logStream.end(() => process.exit(code))
    })
  }
}

process.on('SIGTERM', () => shutdown(0))
process.on('SIGINT', () => shutdown(0))
