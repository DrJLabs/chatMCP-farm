import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8770),
  MCP_BIND_HOST: z.string().min(1).default('0.0.0.0'),
  OIDC_ISSUER: z.string().url('OIDC_ISSUER must be a valid URL'),
  OIDC_AUDIENCE: z.string().min(1, 'OIDC_AUDIENCE is required'),
  MCP_PUBLIC_BASE_URL: z.string().url().default('https://__SERVICE_NAME__.local/mcp'),
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
 * Load and validate the service environment into a typed ServiceEnvConfig.
 *
 * Normalizes any prefixed environment variables (e.g. `__SERVICE_NAME___PORT` → `PORT`), coerces values
 * according to EnvSchema, and returns the parsed configuration. Uses `process.env` by default.
 *
 * @param env - Optional environment object to read from; defaults to `process.env`. The provided
 *   object will be shallow-copied and normalized before validation.
 * @returns The validated and coerced ServiceEnvConfig.
 * @throws ZodError if the normalized environment does not satisfy EnvSchema.
 */
export function loadServiceEnvConfig(env: NodeJS.ProcessEnv = process.env): ServiceEnvConfig {
  const source = normalizeServiceEnv(env)
  return EnvSchema.parse(source)
}

/**
 * Build an environment object for auth-related processes by applying config-derived overrides onto an existing env.
 *
 * The result is a shallow merge of `env` with explicit string overrides derived from `config`; overrides take precedence.
 * Overrides set: `MCP_PUBLIC_BASE_URL`, `PRM_RESOURCE_URL` (falls back to `MCP_PUBLIC_BASE_URL` if unset),
 * `MCP_RESOURCE_URL` (same fallback), `OIDC_ISSUER`, `OIDC_AUDIENCE`, `ALLOWED_ORIGINS`,
 * `REQUIRE_AUTH`, `ENABLE_STREAMABLE`, `ENABLE_SSE`, and `DEBUG_HEADERS`.
 *
 * @param config - Validated service environment config used to produce the overrides.
 * @param env - Base environment object to merge into; defaults to `process.env`.
 * @returns A new environment object (Record<string, string | undefined>) with `config`-derived values applied as strings.
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
 * Returns a shallow copy of the given environment with known service-prefixed keys copied to their canonical names.
 *
 * Copies values from service-prefixed variables (e.g. `__SERVICE_ENV_PREFIX___PORT`) to canonical keys
 * (e.g. `PORT`) when present and non-empty. The original `env` object is not mutated; only the returned object is modified.
 *
 * @param env - The environment object to normalize (typically `process.env`).
 * @returns A new environment object containing the normalized keys.
 */
function normalizeServiceEnv(env: NodeJS.ProcessEnv) {
  const source = { ...env }

  copyIfPresent(source, '__SERVICE_ENV_PREFIX___PORT', 'PORT')
  copyIfPresent(source, '__SERVICE_ENV_PREFIX___BIND_HOST', 'MCP_BIND_HOST')
  copyIfPresent(source, '__SERVICE_ENV_PREFIX___PUBLIC_BASE_URL', 'MCP_PUBLIC_BASE_URL')
  copyIfPresent(source, '__SERVICE_ENV_PREFIX___PRM_URL', 'PRM_RESOURCE_URL')
  copyIfPresent(source, '__SERVICE_ENV_PREFIX___ALLOWED_ORIGINS', 'MCP_ALLOWED_ORIGINS')
  copyIfPresent(source, '__SERVICE_ENV_PREFIX___REQUIRE_AUTH', 'REQUIRE_AUTH')
  copyIfPresent(source, '__SERVICE_ENV_PREFIX___ENABLE_STREAMABLE', 'ENABLE_STREAMABLE')
  copyIfPresent(source, '__SERVICE_ENV_PREFIX___ENABLE_SSE', 'ENABLE_SSE')
  copyIfPresent(source, '__SERVICE_ENV_PREFIX___DEBUG_HEADERS', 'DEBUG_HEADERS')

  return source
}

/**
 * Copy a value from one environment key to another when the source is present and non-empty.
 *
 * If `env[fromKey]` is neither `undefined` nor an empty string, assigns that value to `env[toKey]`.
 * This function mutates the provided `env` object in place.
 *
 * @param env - The environment object to read from and write to.
 * @param fromKey - Source environment variable name to copy from.
 * @param toKey - Destination environment variable name to copy to.
 */
function copyIfPresent(env: NodeJS.ProcessEnv, fromKey: string, toKey: string) {
  const value = env[fromKey]
  if (value !== undefined && value !== '') {
    env[toKey] = value
  }
}
