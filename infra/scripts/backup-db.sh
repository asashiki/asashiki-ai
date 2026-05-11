#!/usr/bin/env bash
# SQLite backup — call via cron, e.g. every Sunday 03:00
# 0 3 * * 0 /opt/apps/asashiki-ai/asashiki-ai/infra/scripts/backup-db.sh >> ~/.local/log/asashiki-backup.log 2>&1
set -euo pipefail

TOKEN=$(grep ADMIN_PANEL_TOKEN /opt/apps/asashiki-ai/asashiki-ai/.env.production | cut -d= -f2)
API="http://127.0.0.1:4100"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Running DB backup..."
curl -sf -X POST "$API/api/admin/backup-db" \
  -H "Authorization: Basic $(printf ":%s" "$TOKEN" | base64 -w0)"
echo
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Done."
