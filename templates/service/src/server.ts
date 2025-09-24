import { createApp } from './app.js'

const { app, envConfig } = await createApp()

const bindHost = envConfig.MCP_BIND_HOST
const port = envConfig.PORT

const server = app.listen(port, bindHost, () => {
  console.log(
    `__SERVICE_NAME__ listening on ${bindHost}:${port} (allowed origins: ${envConfig.MCP_ALLOWED_ORIGINS || 'none'})`,
  )
})

server.on('error', err => {
  console.error('__SERVICE_NAME__ failed to start', err)
  process.exit(1)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 10_000).unref()
  })
}
