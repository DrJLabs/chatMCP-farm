import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8770),
  MCP_BIND_HOST: z.string().min(1).default('127.0.0.1'),
  CLIENT_ID: z.string().optional(),
  CLIENT_SECRET: z.string().optional(),
  OIDC_ISSUER: z.string().url('OIDC_ISSUER must be a valid URL'),
  OIDC_AUDIENCE: z.string().min(1, 'OIDC_AUDIENCE is required'),
  MCP_PUBLIC_BASE_URL: z.string().url().default('https://mcp-test.local/mcp'),
  PRM_RESOURCE_URL: z.string().url().optional(),
  MCP_ALLOWED_ORIGINS: z
    .string()
    .default('http://127.0.0.1:3333,http://localhost:3333'),
  REQUIRE_AUTH: z
    .string()
    .default('true')
    .transform(value => value.toLowerCase() !== 'false'),
  ENABLE_STREAMABLE: z
    .string()
    .default('true')
    .transform(value => value.toLowerCase() !== 'false'),
  ENABLE_SSE: z
    .string()
    .default('false')
    .transform(value => value.toLowerCase() === 'true'),
  DEBUG_HEADERS: z
    .string()
    .default('false')
    .transform(value => value.toLowerCase() === 'true'),
})

export type ServiceEnvConfig = z.infer<typeof EnvSchema>

export function loadServiceEnvConfig(env: NodeJS.ProcessEnv = process.env): ServiceEnvConfig {
  const parsed = EnvSchema.parse(env)

  process.env.PORT = String(parsed.PORT)
  process.env.MCP_BIND_HOST = parsed.MCP_BIND_HOST
  process.env.MCP_PUBLIC_BASE_URL = parsed.MCP_PUBLIC_BASE_URL
  process.env.PRM_RESOURCE_URL = parsed.PRM_RESOURCE_URL ?? parsed.MCP_PUBLIC_BASE_URL
  process.env.REQUIRE_AUTH = parsed.REQUIRE_AUTH ? 'true' : 'false'
  process.env.ENABLE_STREAMABLE = parsed.ENABLE_STREAMABLE ? 'true' : 'false'
  process.env.ENABLE_SSE = parsed.ENABLE_SSE ? 'true' : 'false'
  process.env.DEBUG_HEADERS = parsed.DEBUG_HEADERS ? 'true' : 'false'
  process.env.MCP_ALLOWED_ORIGINS = parsed.MCP_ALLOWED_ORIGINS
  process.env.ALLOWED_ORIGINS = parsed.MCP_ALLOWED_ORIGINS
  if (parsed.CLIENT_ID) process.env.CLIENT_ID = parsed.CLIENT_ID
  if (parsed.CLIENT_SECRET) process.env.CLIENT_SECRET = parsed.CLIENT_SECRET
  process.env.OIDC_ISSUER = parsed.OIDC_ISSUER
  process.env.OIDC_AUDIENCE = parsed.OIDC_AUDIENCE

  return parsed
}
