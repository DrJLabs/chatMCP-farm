import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8770),
  MCP_BIND_HOST: z.string().min(1).default('0.0.0.0'),
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
    .transform(value => value.toLowerCase() !== 'false' && value !== '0'),
  ENABLE_STREAMABLE: z
    .string()
    .default('true')
    .transform(value => value.toLowerCase() !== 'false' && value !== '0'),
  ENABLE_SSE: z
    .string()
    .default('false')
    .transform(value => value.toLowerCase() === 'true' || value === '1'),
  DEBUG_HEADERS: z
    .string()
    .default('false')
    .transform(value => value.toLowerCase() === 'true' || value === '1'),
})

export type ServiceEnvConfig = z.infer<typeof EnvSchema>

export function loadServiceEnvConfig(env: NodeJS.ProcessEnv = process.env): ServiceEnvConfig {
  const source = normalizeServiceEnv(env)
  return EnvSchema.parse(source)
}

export function buildAuthEnv(config: ServiceEnvConfig, env: NodeJS.ProcessEnv = process.env) {
  const overrides: Record<string, string> = {
    MCP_PUBLIC_BASE_URL: config.MCP_PUBLIC_BASE_URL,
    PRM_RESOURCE_URL: config.PRM_RESOURCE_URL ?? config.MCP_PUBLIC_BASE_URL,
    MCP_RESOURCE_URL: config.PRM_RESOURCE_URL ?? config.MCP_PUBLIC_BASE_URL,
    OIDC_ISSUER: config.OIDC_ISSUER,
    OIDC_AUDIENCE: config.OIDC_AUDIENCE,
    ALLOWED_ORIGINS: config.MCP_ALLOWED_ORIGINS,
    REQUIRE_AUTH: String(config.REQUIRE_AUTH),
    ENABLE_STREAMABLE: String(config.ENABLE_STREAMABLE),
    ENABLE_SSE: String(config.ENABLE_SSE),
    DEBUG_HEADERS: String(config.DEBUG_HEADERS),
  }

  return {
    ...env,
    ...overrides,
  }
}

function normalizeServiceEnv(env: NodeJS.ProcessEnv) {
  const source = { ...env }

  copyIfPresent(source, 'MCP_TEST_SERVER_PORT', 'PORT')
  copyIfPresent(source, 'PORT', 'PORT')
  copyIfPresent(source, 'MCP_TEST_SERVER_BIND_HOST', 'MCP_BIND_HOST')
  copyIfPresent(source, 'MCP_TEST_SERVER_PUBLIC_BASE_URL', 'MCP_PUBLIC_BASE_URL')
  copyIfPresent(source, 'MCP_TEST_SERVER_PRM_URL', 'PRM_RESOURCE_URL')
  copyIfPresent(source, 'MCP_TEST_SERVER_ALLOWED_ORIGINS', 'MCP_ALLOWED_ORIGINS')
  copyIfPresent(source, 'MCP_TEST_SERVER_REQUIRE_AUTH', 'REQUIRE_AUTH')
  copyIfPresent(source, 'MCP_TEST_SERVER_ENABLE_STREAMABLE', 'ENABLE_STREAMABLE')
  copyIfPresent(source, 'MCP_TEST_SERVER_ENABLE_SSE', 'ENABLE_SSE')
  copyIfPresent(source, 'MCP_TEST_SERVER_DEBUG_HEADERS', 'DEBUG_HEADERS')

  return source
}

function copyIfPresent(env: NodeJS.ProcessEnv, fromKey: string, toKey: string) {
  const value = env[fromKey]
  if (value !== undefined && value !== '') {
    env[toKey] = value
  }
}
