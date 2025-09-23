# syntax=docker/dockerfile:1.6

FROM node:24-alpine AS deps
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN npm ci --workspaces --include-workspace-root

FROM node:24-alpine AS builder
WORKDIR /workspace
COPY --from=deps /workspace/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN npm run build --workspace services/mcp-test-server

FROM node:24-alpine
WORKDIR /app
COPY --from=deps /workspace/package.json ./
COPY --from=deps /workspace/package-lock.json ./
COPY --from=deps /workspace/tsconfig.base.json ./
COPY --from=deps /workspace/packages ./packages
COPY --from=deps /workspace/services ./services
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=builder /workspace/services/mcp-test-server/dist ./services/mcp-test-server/dist
RUN npm prune --omit=dev --workspaces --include-workspace-root && npm cache clean --force
WORKDIR /app/services/mcp-test-server
EXPOSE 8770
CMD ["node", "dist/server.js"]
