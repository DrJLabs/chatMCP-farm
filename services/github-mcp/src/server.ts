import { createApp } from './app.js'

const { app, envConfig } = await createApp()

const bindHost = envConfig.MCP_BIND_HOST
const port = envConfig.PORT

app.listen(port, bindHost, () => {
  console.log(
    `github-mcp listening on ${bindHost}:${port} (allowed origins: ${envConfig.MCP_ALLOWED_ORIGINS || 'none'})`,
  )
})
