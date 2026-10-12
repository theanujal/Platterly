#!/usr/bin/env bash
# Proves the backups can be restored (docs/data-safety.md: "a backup that has never been restored is not a backup").
#   restore-drill.sh            restores the newest catering and ops dumps into scratch databases, counts rows, drops them again
# Never touches the live databases. Needs a Postgres user that may create databases (the platterly role has CREATEDB).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
LOG_TAG="restore-drill"

db_url() {
  local url; url="$(grep -E '^DATABASE_URL=' "$ENV_DIR/$1.env" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
  echo "${url%%\?*}"
}
# The same server and login, a different database name.
with_db() { echo "${1%/*}/$2"; }

drill() {
  local app="$1" table="$2"
  local dump; dump="$(ls -1t "$BACKUP_DIR"/daily/"$app"-*.dump 2>/dev/null | head -1 || true)"
  [ -n "$dump" ] || die "no $app dump found in $BACKUP_DIR/daily"
  local live; live="$(db_url "$app")"
  local scratch="platterly_drill_${app}_$$"
  local scratch_url; scratch_url="$(with_db "$live" "$scratch")"
  local admin_url; admin_url="$(with_db "$live" "postgres")"
  log "restoring $(basename "$dump") into $scratch"
  psql "$admin_url" -v ON_ERROR_STOP=1 -qc "CREATE DATABASE \"$scratch\"" || die "could not create $scratch (does the role have CREATEDB?)"
  local rc=0
  (
    pg_restore --no-owner --dbname "$scratch_url" "$dump" || { echo "pg_restore reported errors for $app" >&2; exit 1; }
    restored="$(psql "$scratch_url" -Atc "SELECT count(*) FROM \"$table\"")"
    liveCount="$(psql "$live" -Atc "SELECT count(*) FROM \"$table\"")"
    log "$app: $restored rows in $table after the restore (live now: $liveCount)"
    [ "$restored" -gt 0 ] || [ "$liveCount" -eq 0 ] || { echo "$app restored an empty $table although the live one has rows" >&2; exit 1; }
  ) || rc=$?
  psql "$admin_url" -qc "DROP DATABASE IF EXISTS \"$scratch\"" >/dev/null || log "could not drop $scratch; drop it by hand"
  [ "$rc" -eq 0 ] || die "the $app restore drill failed"
}

drill catering organization
drill ops product
log "restore drill passed"
printf '{"ok":true,"at":"%s"}\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$BACKUP_DIR/last-restore-drill.json"
