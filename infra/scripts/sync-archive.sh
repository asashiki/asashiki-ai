#!/usr/bin/env bash
# Sync Asashiki_Archive to private GitHub repository
# Cron: 0 4 * * * /opt/apps/asashiki-ai/asashiki-ai/infra/scripts/sync-archive.sh >> ~/.local/log/archive-sync.log 2>&1
# (Use ~/.local/log/, NOT /var/log/ — asashiki user has no write perm there.)
set -euo pipefail

ARCHIVE_DIR="/opt/asashiki/Asashiki_Archive"
DATE=$(TZ=Asia/Shanghai date +%Y-%m-%d)
TIME=$(TZ=Asia/Shanghai date +%H:%M)

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting archive sync..."

cd "$ARCHIVE_DIR"

# Stage all changes
git add -A

# Check if there's anything to commit
if git diff --cached --quiet; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] No changes, skipping commit."
else
  CHANGED=$(git diff --cached --name-only | wc -l | tr -d ' ')
  git commit -m "sync: ${DATE} ${TIME} (${CHANGED} files changed)"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Committed ${CHANGED} changed files."
fi

# Push
git push origin main
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Pushed to GitHub. Done."
