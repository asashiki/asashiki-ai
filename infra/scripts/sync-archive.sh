#!/usr/bin/env bash
# Bidirectional sync of Asashiki_Archive with GitHub.
#   1. Commit any local changes (notes written by Claude / MCP on this VPS).
#   2. Fetch + rebase remote changes (notes synced up from the Windows side).
#   3. Push the result back.
#
# Cron: 0 4 * * * /opt/apps/asashiki-ai/asashiki-ai/infra/scripts/sync-archive.sh >> ~/.local/log/archive-sync.log 2>&1
# (Use ~/.local/log/, NOT /var/log/ — asashiki user has no write perm there.)
#
# Conflict policy: on rebase conflict the script aborts the rebase and exits
# non-zero. It does NOT auto-resolve, because silently picking a side could
# lose diary content. The next run will retry — fix manually if it persists.
set -euo pipefail

ARCHIVE_DIR="/opt/asashiki/Asashiki_Archive"
DATE=$(TZ=Asia/Shanghai date +%Y-%m-%d)
TIME=$(TZ=Asia/Shanghai date +%H:%M)

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

log "Starting archive sync (bidirectional)..."

cd "$ARCHIVE_DIR"

# ── 1. Commit any local changes ─────────────────────────────────────────
git add -A
if git diff --cached --quiet; then
  log "No local changes to commit."
else
  CHANGED=$(git diff --cached --name-only | wc -l | tr -d ' ')
  git commit -m "sync(vps): ${DATE} ${TIME} (${CHANGED} files changed)"
  log "Committed ${CHANGED} local changes."
fi

# ── 2. Pull remote changes, rebasing local commits on top ───────────────
git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
BASE=$(git merge-base HEAD origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  log "Already up to date with origin/main."
elif [ "$LOCAL" = "$BASE" ]; then
  # Local is strictly behind — fast-forward.
  git merge --ff-only origin/main
  log "Fast-forwarded to origin/main."
else
  # Local has commits not in origin. Rebase ours on top of theirs.
  if git rebase origin/main; then
    log "Rebased local commits onto origin/main."
  else
    log "ERROR: rebase conflict. Aborting rebase. Resolve manually in $ARCHIVE_DIR."
    git rebase --abort || true
    exit 1
  fi
fi

# ── 3. Push the merged result ───────────────────────────────────────────
if git push origin main; then
  log "Pushed to GitHub. Done."
else
  log "ERROR: push failed (remote may have advanced again; will retry next run)."
  exit 2
fi
