# ── builder ──────────────────────────────────────
FROM node:20 AS builder

RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/ packages/

RUN npm install --ignore-scripts --no-audit --no-fund && \
    npm rebuild better-sqlite3 node-pty @node-rs/jieba

COPY . .

RUN node scripts/patch-pi-sdk.cjs; \
    npm run build:packages && \
    npm run build:renderer && \
    npm prune --production

# ── runtime ──────────────────────────────────────
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/docker-entrypoint.sh ./
COPY --from=builder /app/server ./server
COPY --from=builder /app/core ./core
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/hub ./hub
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/plugins ./plugins
COPY --from=builder /app/skills2set ./skills2set
COPY --from=builder /app/desktop/src ./desktop/src
COPY --from=builder /app/desktop/dist-renderer ./desktop/dist-renderer

RUN chmod +x docker-entrypoint.sh

ENV HANA_ROOT=/app
ENV HANA_HOME=/data
ENV HANA_PORT=14500
ENV NODE_ENV=production

VOLUME ["/data"]

EXPOSE 14500

ENTRYPOINT ["./docker-entrypoint.sh"]
