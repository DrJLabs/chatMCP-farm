# syntax=docker/dockerfile:1.6

FROM node:24-alpine AS deps
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY services/github-mcp/package.json services/github-mcp/
COPY packages/mcp-auth-kit/package.json packages/mcp-auth-kit/
RUN npm ci --ignore-scripts --workspace packages/mcp-auth-kit --workspace services/github-mcp
COPY packages/mcp-auth-kit/tsconfig.json packages/mcp-auth-kit/
COPY packages/mcp-auth-kit/src packages/mcp-auth-kit/src
RUN npm run build --workspace packages/mcp-auth-kit

FROM node:24-alpine AS builder
WORKDIR /workspace
COPY --from=deps /workspace/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY services/github-mcp/package.json services/github-mcp/
COPY services/github-mcp/tsconfig.build.json services/github-mcp/
COPY services/github-mcp/tsconfig.json services/github-mcp/
COPY services/github-mcp/src services/github-mcp/src
COPY --from=deps /workspace/packages ./packages
RUN npm run build --workspace services/github-mcp

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /workspace/package.json ./package.json
COPY --from=deps /workspace/package-lock.json ./package-lock.json
COPY services/github-mcp/package.json ./services/github-mcp/package.json
COPY packages/mcp-auth-kit/package.json ./packages/mcp-auth-kit/package.json
COPY --from=deps /workspace/packages/mcp-auth-kit/dist ./packages/mcp-auth-kit/dist
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=builder /workspace/services/github-mcp/dist ./services/github-mcp/dist
RUN npm_config_ignore_scripts=true npm prune --omit=dev --workspaces --include-workspace-root \
  && npm cache clean --force
RUN chown -R node:node /app
WORKDIR /app/services/github-mcp
USER node
EXPOSE 8770
CMD ["node", "dist/server.js"]
