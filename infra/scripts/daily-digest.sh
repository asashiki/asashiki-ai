#!/usr/bin/env bash
# Daily Markdown digest — call via cron, e.g. every day 23:50
# 50 23 * * * /opt/apps/asashiki-ai/asashiki-ai/infra/scripts/daily-digest.sh >> ~/.local/log/asashiki-digest.log 2>&1
set -euo pipefail

TOKEN=$(grep ADMIN_PANEL_TOKEN /opt/apps/asashiki-ai/asashiki-ai/.env.production | cut -d= -f2)
API="http://127.0.0.1:4100"

# Use Shanghai timezone for "today"
DATE=$(TZ=Asia/Shanghai date +%Y-%m-%d)

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Generating daily digest for $DATE..."
curl -sf -X POST "$API/api/admin/daily-digest?date=$DATE" \
  -H "Authorization: Basic $(printf ":%s" "$TOKEN" | base64 -w0)"
echo
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Done."
