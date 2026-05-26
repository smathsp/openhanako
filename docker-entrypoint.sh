#!/bin/sh
set -e

NETWORK_FILE="$HANA_HOME/server-network.json"

mkdir -p "$HANA_HOME"

# Docker 容器必须监听 0.0.0.0 才能从外部访问
cat > "$NETWORK_FILE" <<EOF
{
  "schemaVersion": 1,
  "mode": "lan",
  "listenHost": "0.0.0.0",
  "listenPort": ${HANA_PORT:-14500},
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
echo "[entrypoint] server-network.json set to lan mode (0.0.0.0)"

exec node server/index.js
