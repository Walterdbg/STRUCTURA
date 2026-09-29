#!/bin/sh
# STRUCTURA backup: once at start, then every 24 hours.
#   structura_<time>.dump      - the database (pg_dump custom format)
#   structura_<time>_files.tar - managed files (product photos)
# A backup set counts only when both parts are complete (spec 18.3:
# relational data plus managed files). Keeps the newest $KEEP sets
# (default 14). Each part is written to .tmp first and renamed when
# complete, so a half-written file is never kept.
set -u
KEEP="${KEEP:-14}"

while true; do
  stamp="$(date +%Y-%m-%d_%H%M)"
  db="/backups/structura_${stamp}.dump"
  files="/backups/structura_${stamp}_files.tar"
  if pg_dump -h structura-db -U structura -d structura -Fc -f "$db.tmp" \
     && tar -cf "$files.tmp" -C /data files; then
    mv "$db.tmp" "$db"
    mv "$files.tmp" "$files"
    echo "backup written: $db + $files"
    ls -1t /backups/structura_*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
      rm -f "$old" "${old%.dump}_files.tar"
    done
  else
    rm -f "$db.tmp" "$files.tmp"
    echo "backup FAILED at $(date)" >&2
  fi
  sleep 86400
done
