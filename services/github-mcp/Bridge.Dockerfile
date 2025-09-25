# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20.17.0-alpine3.20
ARG GITHUB_MCP_SERVER_VERSION=0.15.0
ARG GITHUB_MCP_SERVER_SHA256=14b72ee93f2adfbe330be116bc2387845ab2c46b9e686e5659214d7fe75a422b
ARG MCP_PROXY_VERSION=5.6.1

FROM node:${NODE_VERSION} AS build
ARG GITHUB_MCP_SERVER_VERSION
ARG GITHUB_MCP_SERVER_SHA256
ARG MCP_PROXY_VERSION
ENV GH_MCP_SERVER_FILENAME=github-mcp-server_Linux_x86_64.tar.gz
WORKDIR /tmp/github-mcp-server
RUN apk add --no-cache bash curl tar coreutils
RUN curl -fsSLo ${GH_MCP_SERVER_FILENAME} \
      https://github.com/github/github-mcp-server/releases/download/v${GITHUB_MCP_SERVER_VERSION}/${GH_MCP_SERVER_FILENAME} \
    && echo "${GITHUB_MCP_SERVER_SHA256}  ${GH_MCP_SERVER_FILENAME}" > checksum.txt \
    && sha256sum -c checksum.txt
RUN tar -xzf ${GH_MCP_SERVER_FILENAME} \
    && install -Dm755 github-mcp-server /opt/github-mcp/bin/github-mcp-server \
    && install -Dm644 LICENSE /opt/github-mcp/LICENSE \
    && install -Dm644 README.md /opt/github-mcp/README.md
RUN npm install -g mcp-proxy@${MCP_PROXY_VERSION}

FROM node:${NODE_VERSION}
ARG GITHUB_MCP_SERVER_VERSION
ARG MCP_PROXY_VERSION
ENV NODE_ENV=production \
    PORT=9090 \
    BRIDGE_HOST=0.0.0.0 \
    BRIDGE_METRICS_PORT=9300 \
    BRIDGE_LOG_DIR=/var/log/bridge \
    GITHUB_MCP_SERVER_VERSION=${GITHUB_MCP_SERVER_VERSION} \
    MCP_PROXY_VERSION=${MCP_PROXY_VERSION}
RUN apk add --no-cache bash tini \
    && mkdir -p /var/log/bridge
COPY --from=build /opt/github-mcp/bin/github-mcp-server /usr/local/bin/github-mcp-server
COPY --from=build /opt/github-mcp/LICENSE /usr/local/share/github-mcp/LICENSE
COPY --from=build /opt/github-mcp/README.md /usr/local/share/github-mcp/README.md
COPY --from=build /usr/local/bin/mcp-proxy /usr/local/bin/mcp-proxy
COPY --from=build /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY services/github-mcp/bridge/entrypoint.mjs /usr/local/bin/bridge-entrypoint.mjs
RUN chmod +x /usr/local/bin/bridge-entrypoint.mjs
VOLUME ["/var/log/bridge"]
EXPOSE 9090 9300
ENTRYPOINT ["tini", "-g", "--", "node", "/usr/local/bin/bridge-entrypoint.mjs"]
