#!/usr/bin/env bash
# SQLite backup — call via cron, every Sunday 03:00
# 0 3 * * 0 /opt/apps/asashiki-ai/asashiki-ai/infra/scripts/backup-db.sh >> ~/.local/log/asashiki-backup.log 2>&1
#
# Retention: keep the most recent KEEP_RECENT weekly snapshots, plus the
# earliest snapshot of every month for long-term history. Older weekly
# snapshots in between are pruned so the Archive git repo doesn't bloat.
set -euo pipefail

TOKEN=$(grep ADMIN_PANEL_TOKEN /opt/apps/asashiki-ai/asashiki-ai/.env.production | cut -d= -f2)
API="http://127.0.0.1:4100"
BACKUP_DIR="/opt/asashiki/Asashiki_Archive/Obsidian_Asashiki/归档/数据库备份"
KEEP_RECENT=8

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Running DB backup..."
curl -sf -X POST "$API/api/admin/backup-db" \
  -H "Authorization: Basic $(printf ":%s" "$TOKEN" | base64 -w0)"
echo
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Pruning old backups (keep last ${KEEP_RECENT} weeks + monthly anchor)..."

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "  backup dir missing: $BACKUP_DIR — skipping prune."
else
  cd "$BACKUP_DIR"
  mapfile -t all < <(ls -1 core-api-*.sqlite 2>/dev/null | sort)
  total=${#all[@]}

  if (( total == 0 )); then
    echo "  no backups found."
  else
    declare -A keep=()
    # Keep the N most recent snapshots.
    start=$(( total > KEEP_RECENT ? total - KEEP_RECENT : 0 ))
    for ((i = start; i < total; i++)); do
      keep["${all[i]}"]=1
    done
    # Keep the earliest snapshot of every YYYY-MM as a monthly anchor.
    declare -A monthFirst=()
    for f in "${all[@]}"; do
      ym=${f#core-api-}
      ym=${ym:0:7}
      [[ -z "${monthFirst[$ym]:-}" ]] && monthFirst[$ym]=$f
    done
    for f in "${monthFirst[@]}"; do
      keep[$f]=1
    done

    pruned=0
    for f in "${all[@]}"; do
      if [[ -z "${keep[$f]:-}" ]]; then
        rm -- "$f"
        echo "  pruned $f"
        pruned=$((pruned + 1))
      fi
    done
    echo "  kept ${#keep[@]} / ${total}, pruned ${pruned}."
  fi
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Done."
