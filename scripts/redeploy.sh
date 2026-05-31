#!/bin/bash
# redeploy.sh — Deploy image mới, luôn GIỮ nguyên DB hiện tại.
#
# Cách dùng:
#   ./scripts/redeploy.sh              # deploy image mới, GIỮ nguyên DB hiện tại
#   ./scripts/redeploy.sh --keep-db    # tương thích cũ, cũng giữ DB

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

case "${1:-}" in
    ""|--keep-db)
        ;;
    *)
        echo "Usage: $0 [--keep-db]"
        exit 1
        ;;
esac

echo "==> Pulling latest image…"
docker compose pull

echo "==> Stopping container…"
docker compose down

echo "==> Starting with existing database…"
docker compose up -d

echo "==> Waiting for health check…"
sleep 5
docker compose ps
