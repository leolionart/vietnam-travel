#!/bin/bash
# redeploy.sh — Deploy image mới + reset DB từ plans.json
# Dùng khi: cập nhật plans.json, migrate.ts, hoặc muốn sync dữ liệu từ code
#
# Cách dùng:
#   ./scripts/redeploy.sh              # fresh deploy (reset DB)
#   ./scripts/redeploy.sh --keep-db    # deploy image mới, GIỮ nguyên DB hiện tại

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

KEEP_DB=false
if [[ "$1" == "--keep-db" ]]; then
    KEEP_DB=true
fi

echo "==> Pulling latest image…"
docker compose pull

echo "==> Stopping container…"
docker compose down

if [[ "$KEEP_DB" == "false" ]]; then
    echo "==> Resetting database (FORCE_MIGRATE=true)…"
    FORCE_MIGRATE=true docker compose up -d
else
    echo "==> Starting with existing database…"
    docker compose up -d
fi

echo "==> Waiting for health check…"
sleep 5
docker compose ps
