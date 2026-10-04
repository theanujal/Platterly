#!/usr/bin/env bash
# Takes a compressed Postgres backup. Run it BEFORE every production deploy that includes a migration.
# Usage: DATABASE_URL=... scripts/backup-db.sh [output-dir]
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
out="${1:-backups}"; mkdir -p "$out"
file="$out/platterly-$(date +%Y%m%d-%H%M%S).sql.gz"
pg_dump --no-owner --format=plain "${DATABASE_URL%%\?*}" | gzip > "$file"
test -s "$file" || { echo "Backup is empty" >&2; exit 1; }
echo "Backup written: $file"
