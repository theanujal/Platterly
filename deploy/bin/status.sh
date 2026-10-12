#!/usr/bin/env bash
# What is live: the active slot of each app, whether each slot's service is up and healthy, the release it holds, and the last backup.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
for app in catering ops; do
  active="$(active_slot "$app")"
  printf '%s: live on %s\n' "$app" "$active"
  for slot in blue green; do
    unit="$(unit_of "$app" "$slot")"
    state="$(systemctl is-active "$unit" 2>/dev/null || true)"
    health="down"; curl -fsS -m 3 "$(health_url "$app" "$slot")" 2>/dev/null | grep -q '"status":"ok"' && health="healthy"
    sha="$(git -C "$(slot_dir "$app" "$slot")" rev-parse --short HEAD 2>/dev/null || echo -)"
    printf '  %-6s service=%-9s health=%-8s release=%s%s\n' "$slot" "${state:-unknown}" "$health" "$sha" "$([ "$slot" = "$active" ] && echo '  <- serving' || true)"
  done
done
[ -f "$BACKUP_DIR/last-backup.json" ] && { printf 'last backup: '; cat "$BACKUP_DIR/last-backup.json"; echo; } || echo "last backup: none recorded"
