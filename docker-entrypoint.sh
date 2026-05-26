#!/bin/sh
set -e

NETWORK_FILE="$HANA_HOME/server-network.json"

if [ ! -f "$NETWORK_FILE" ]; then
  mkdir -p "$HANA_HOME"
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
  echo "[entrypoint] created $NETWORK_FILE (lan mode, 0.0.0.0)"
fi

exec node server/index.js
