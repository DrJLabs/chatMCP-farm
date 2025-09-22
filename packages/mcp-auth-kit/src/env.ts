export interface AuthEnvVariable {
  name: string
  description: string
  required: boolean
  defaultValue?: string
  sensitive?: boolean
}

export interface AuthEnvSummary extends AuthEnvVariable {
  value?: string
  source: 'env' | 'default' | 'missing'
}

export const AUTH_ENV_VARS: AuthEnvVariable[] = [
  {
    name: 'MCP_PUBLIC_BASE_URL',
    description: 'Canonical HTTPS endpoint for the MCP service (e.g. https://mcp.example.com/mcp).',
    required: false,
  },
  {
    name: 'PRM_RESOURCE_URL',
    description: 'OAuth protected-resource metadata URL supplied to ChatGPT; defaults to MCP_PUBLIC_BASE_URL when omitted.',
    required: false,
  },
  {
    name: 'MCP_RESOURCE_URL',
    description: 'Explicit resource audience override if it differs from the public base URL.',
    required: false,
  },
  {
    name: 'OIDC_ISSUER',
    description: 'Keycloak issuer URL (realm base), e.g. https://keycloak.example.com/auth/realms/example.',
    required: true,
  },
  {
    name: 'OIDC_AUDIENCE',
    description: 'Comma-separated audiences accepted by the MCP (must include the MCP resource URL).',
    required: true,
  },
  {
    name: 'ALLOWED_ORIGINS',
    description: 'Optional comma-separated list of additional CORS origins.',
    required: false,
    defaultValue: 'https://chatgpt.com,https://chat.openai.com',
  },
  {
    name: 'ENABLE_STREAMABLE',
    description: 'Enable Streamable HTTP transport (false to disable).',
    required: false,
    defaultValue: 'true',
  },
  {
    name: 'ENABLE_SSE',
    description: 'Expose legacy Server-Sent Events transport (false to disable).',
    required: false,
    defaultValue: 'true',
  },
  {
    name: 'REQUIRE_AUTH',
    description: 'Require OAuth bearer tokens for MCP endpoints.',
    required: false,
    defaultValue: 'true',
  },
  {
    name: 'DEBUG_HEADERS',
    description: 'Log request headers for diagnostics (writes sanitized output).',
    required: false,
    defaultValue: 'false',
  },
  {
    name: 'MCP_NAME_HUMAN',
    description: 'Override manifest name presented to humans.',
    required: false,
  },
  {
    name: 'MCP_NAME_MODEL',
    description: 'Override manifest name presented to the model.',
    required: false,
  },
  {
    name: 'MCP_DESCRIPTION_HUMAN',
    description: 'Override manifest description for humans.',
    required: false,
  },
  {
    name: 'MCP_DESCRIPTION_MODEL',
    description: 'Override manifest description for the model.',
    required: false,
  },
]

export function summarizeAuthEnv(env: NodeJS.ProcessEnv = process.env): AuthEnvSummary[] {
  return AUTH_ENV_VARS.map(variable => {
    const raw = env[variable.name]
    if (raw && raw.length > 0) {
      return {
        ...variable,
        value: variable.sensitive ? '***' : raw,
        source: 'env' as const,
      }
    }
    if (variable.defaultValue !== undefined) {
      return {
        ...variable,
        value: variable.defaultValue,
        source: 'default' as const,
      }
    }
    return {
      ...variable,
      value: undefined,
      source: 'missing' as const,
    }
  })
}
