#!/usr/bin/env bash
# Mirror data/ somewhere that is not this laptop.
#
# The real longan photos collected during the PoC are the only thing that
# unlocks a segmentation model, and they cannot be re-collected out of season.
# One MacBook is one disk: a drive failure in August costs the whole harvest's
# dataset.
#
#   ./backup-data.sh /Volumes/Backup/kat-pon-dee
#   ./backup-data.sh ~/Library/CloudStorage/GoogleDrive-.../kat-pon-dee
#
# Add to crontab for hourly:
#   0 * * * * cd <backend> && ./backup-data.sh <dest> >> data/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"

DEST="${1:-}"
if [[ -z "$DEST" ]]; then
  echo "usage: $0 <destination-dir>" >&2
  exit 2
fi

SRC="${DATA_DIR:-$PWD/data}"
[[ -d "$SRC" ]] || { echo "no data directory at $SRC" >&2; exit 1; }
mkdir -p "$DEST"

# No --delete: a mirror that propagates an accidental `rm -rf data/` is not a
# backup. Growing the destination is the cheaper mistake.
#
# Portable flags only. Recent macOS ships openrsync rather than GNU rsync, and
# it rejects --info=stats1 with a usage dump that looks like a broken script.
rsync -a \
  --exclude '.api-token' \
  --exclude 'backup.log' \
  "$SRC/" "$DEST/"

printf '%s  captures=%s  sessions=%s  growers=%s\n' \
  "$(date '+%Y-%m-%d %H:%M:%S')" \
  "$(find "$DEST/captures" -name '*.jpg' 2>/dev/null | wc -l | tr -d ' ')" \
  "$(find "$DEST/sessions" -name '*.jsonl' 2>/dev/null | wc -l | tr -d ' ')" \
  "$(wc -l < "$DEST/growers.jsonl" 2>/dev/null | tr -d ' ' || echo 0)"
