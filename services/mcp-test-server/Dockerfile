# syntax=docker/dockerfile:1.6

FROM node:24-alpine AS deps
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY services/mcp-test-server/package.json services/mcp-test-server/
COPY packages/mcp-auth-kit/package.json packages/mcp-auth-kit/
RUN npm ci --workspace packages/mcp-auth-kit --workspace services/mcp-test-server

COPY packages/mcp-auth-kit/tsconfig.json packages/mcp-auth-kit/
COPY packages/mcp-auth-kit/src packages/mcp-auth-kit/src
RUN npm run build --workspace packages/mcp-auth-kit

FROM node:24-alpine AS builder
WORKDIR /workspace
COPY --from=deps /workspace/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY services/mcp-test-server/package.json services/mcp-test-server/
COPY services/mcp-test-server/tsconfig.build.json services/mcp-test-server/
COPY services/mcp-test-server/tsconfig.json services/mcp-test-server/
COPY services/mcp-test-server/src services/mcp-test-server/src
COPY --from=deps /workspace/packages ./packages
RUN npm run build --workspace services/mcp-test-server

FROM node:24-alpine AS runner
WORKDIR /app
COPY --from=deps /workspace/package.json ./package.json
COPY --from=deps /workspace/package-lock.json ./package-lock.json
COPY services/mcp-test-server/package.json ./services/mcp-test-server/package.json
COPY packages/mcp-auth-kit/package.json ./packages/mcp-auth-kit/package.json
COPY --from=deps /workspace/packages/mcp-auth-kit/dist ./packages/mcp-auth-kit/dist
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=builder /workspace/services/mcp-test-server/dist ./services/mcp-test-server/dist
RUN npm prune --omit=dev --workspaces --include-workspace-root && npm cache clean --force
WORKDIR /app/services/mcp-test-server
EXPOSE 8770
CMD ["node", "dist/server.js"]
