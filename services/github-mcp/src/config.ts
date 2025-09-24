import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8770),
  MCP_BIND_HOST: z.string().min(1).default('0.0.0.0'),
  OIDC_ISSUER: z.string().url('OIDC_ISSUER must be a valid URL'),
  OIDC_AUDIENCE: z.string().min(1, 'OIDC_AUDIENCE is required'),
  MCP_PUBLIC_BASE_URL: z.string().url().default('https://github-mcp.local/mcp'),
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

/**
 * Normalize the provided environment and parse it into a validated ServiceEnvConfig.
 *
 * The input environment is first normalized (legacy keys mapped to current keys) and then
 * validated/coerced against the EnvSchema. Returns a fully typed configuration object.
 *
 * @returns The parsed and validated ServiceEnvConfig.
 * @throws ZodError If required environment variables are missing or fail validation.
 */
export function loadServiceEnvConfig(env: NodeJS.ProcessEnv = process.env): ServiceEnvConfig {
  const source = normalizeServiceEnv(env)
  return EnvSchema.parse(source)
}

/**
 * Build a process-style environment object containing auth- and runtime-related overrides derived from a validated ServiceEnvConfig.
 *
 * The returned object is a shallow merge of `env` with generated overrides (overrides take precedence). Boolean flags from the config are stringified. `PRM_RESOURCE_URL` and `MCP_RESOURCE_URL` are set to `config.PRM_RESOURCE_URL` when present, otherwise they fall back to `config.MCP_PUBLIC_BASE_URL`.
 *
 * @param config - Parsed service environment configuration (ServiceEnvConfig) used to produce override values.
 * @param env - Base environment object to merge overrides into; defaults to `process.env`.
 * @returns A new environment object (string -> string) combining `env` with auth/runtime overrides such as `MCP_PUBLIC_BASE_URL`, `PRM_RESOURCE_URL`, `MCP_RESOURCE_URL`, `OIDC_ISSUER`, `OIDC_AUDIENCE`, `ALLOWED_ORIGINS`, `REQUIRE_AUTH`, `ENABLE_STREAMABLE`, `ENABLE_SSE`, and `DEBUG_HEADERS`.
 */
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

/**
 * Normalize environment by copying legacy GITHUB_MCP_* variables to current keys.
 *
 * Creates a shallow copy of the provided env and, for each recognized legacy
 * `GITHUB_MCP_*` key, copies its value to the corresponding modern key when
 * present and non-empty. The original `env` object is not mutated.
 *
 * @param env - Source environment object (e.g., `process.env`).
 * @returns A new environment object with legacy variables mapped to current keys.
 */
function normalizeServiceEnv(env: NodeJS.ProcessEnv) {
  const source = { ...env }

  copyIfPresent(source, 'GITHUB_MCP_PORT', 'PORT')
  copyIfPresent(source, 'GITHUB_MCP_BIND_HOST', 'MCP_BIND_HOST')
  copyIfPresent(source, 'GITHUB_MCP_PUBLIC_BASE_URL', 'MCP_PUBLIC_BASE_URL')
  copyIfPresent(source, 'GITHUB_MCP_PRM_URL', 'PRM_RESOURCE_URL')
  copyIfPresent(source, 'GITHUB_MCP_ALLOWED_ORIGINS', 'MCP_ALLOWED_ORIGINS')
  copyIfPresent(source, 'GITHUB_MCP_REQUIRE_AUTH', 'REQUIRE_AUTH')
  copyIfPresent(source, 'GITHUB_MCP_ENABLE_STREAMABLE', 'ENABLE_STREAMABLE')
  copyIfPresent(source, 'GITHUB_MCP_ENABLE_SSE', 'ENABLE_SSE')
  copyIfPresent(source, 'GITHUB_MCP_DEBUG_HEADERS', 'DEBUG_HEADERS')

  return source
}

/**
 * Copy a non-empty environment variable value from one key to another (in-place).
 *
 * If `env[fromKey]` is defined and not an empty string, sets `env[toKey]` to that value.
 *
 * @param env - The environment object to modify (e.g., `process.env`).
 * @param fromKey - Source environment variable name.
 * @param toKey - Destination environment variable name to set.
 */
function copyIfPresent(env: NodeJS.ProcessEnv, fromKey: string, toKey: string) {
  const value = env[fromKey]
  if (value !== undefined && value !== '') {
    env[toKey] = value
  }
}
