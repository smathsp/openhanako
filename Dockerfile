FROM node:20

RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm install --ignore-scripts --no-audit --no-fund && \
    npm rebuild && \
    node scripts/patch-pi-sdk.cjs; \
    npm run build:packages && \
    npm run build:renderer

ENV HANA_ROOT=/app
ENV HANA_HOME=/data
ENV HANA_PORT=14500
ENV NODE_ENV=production

VOLUME ["/data"]

EXPOSE 14500

CMD ["node", "server/index.js"]
