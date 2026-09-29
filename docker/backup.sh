#!/bin/sh
# STRUCTURA database backup: one pg_dump at start, then every 24 hours.
# Keeps the newest $KEEP dumps (default 14). A dump is written to .tmp first
# and renamed only when complete, so a half-written file is never kept.
set -u
KEEP="${KEEP:-14}"

while true; do
  f="/backups/structura_$(date +%Y-%m-%d_%H%M).dump"
  if pg_dump -h structura-db -U structura -d structura -Fc -f "$f.tmp"; then
    mv "$f.tmp" "$f"
    echo "backup written: $f"
    ls -1t /backups/structura_*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
  else
    rm -f "$f.tmp"
    echo "backup FAILED at $(date)" >&2
  fi
  sleep 86400
done
