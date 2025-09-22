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
  const source = { ...env }
  if (source.MCP_TEST_SERVER_PUBLIC_BASE_URL && !source.MCP_PUBLIC_BASE_URL) {
    source.MCP_PUBLIC_BASE_URL = source.MCP_TEST_SERVER_PUBLIC_BASE_URL
  }

  return EnvSchema.parse(source)
}
