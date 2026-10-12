#!/usr/bin/env bash
# Blue/green deploy of one app (deploy/README.md).
#   deploy.sh catering [git-ref]      deploy.sh ops [git-ref]        (default ref: origin/main)
# Builds the release in the idle slot, backs up and migrates the database, starts the idle slot, checks it, and only then moves
# Nginx to it. The slot that was live stays up for DRAIN_MINUTES so rollback.sh is one command. Any failure before the switch leaves the
# live slot exactly as it was.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
LOG_TAG="deploy"

app="${1:-}"; ref="${2:-origin/main}"
require_app "$app"
active="$(active_slot "$app")"; idle="$(other_slot "$active")"
clone="$(slot_dir "$app" "$idle")"
dir="$(app_dir "$app" "$clone")"
log "deploying $app ($ref) to the $idle slot; $active is live"

# 1. The code, in the idle slot's own clone.
if [ ! -d "$clone/.git" ]; then mkdir -p "$(dirname "$clone")"; git clone "$REPO_URL" "$clone"; fi
git -C "$clone" fetch --prune origin
sha="$(git -C "$clone" rev-parse "$ref")"
git -C "$clone" checkout --detach "$sha"
log "checked out $sha"

# 2. Build. The migration guard first, so a release that could lose data never gets as far as the database.
if [ "$app" = ops ]; then
  ( cd "$clone" && node scripts/check-migrations.mjs )
  ( cd "$dir" && npm ci && npm run build )
else
  ( cd "$clone" && npm ci && npm run check:migrations && npm run build )
fi

# 3. Database: backup, then only additive migrations (both slots share the database, so the live slot keeps working).
# Catering's first, then Ops's own (docs/production-checklist.md).
"$HERE/backup.sh" --db-only --tag "pre-deploy-$app-${sha:0:8}"
if [ "$app" = ops ]; then ( cd "$dir" && npx prisma migrate deploy ); else ( cd "$clone" && npx prisma migrate deploy ); fi

# 4. Start the idle slot and prove it works before any visitor is sent to it.
systemctl restart "$(unit_of "$app" "$idle")"
if ! wait_healthy "$app" "$idle"; then
  log "the $idle slot did not become healthy; the live slot ($active) is untouched. Last log lines:"
  journalctl -u "$(unit_of "$app" "$idle")" -n 25 --no-pager || true
  systemctl stop "$(unit_of "$app" "$idle")" || true
  exit 1
fi

# 5. Move traffic, remember it, and let the old slot drain.
switch_traffic "$app" "$idle"
record_release "$app" "$idle" "$sha"
if [ "$DRAIN_MINUTES" -gt 0 ]; then
  systemd-run --quiet --on-active="${DRAIN_MINUTES}m" --unit="platterly-drain-$app-$active" systemctl stop "$(unit_of "$app" "$active")" || log "could not schedule stopping $active; stop it by hand when you are sure"
fi
# The scripts themselves ship with the release: the next deploy and the systemd units use the newest copy.
mkdir -p "$PLATTERLY_ROOT/bin" && install -m 0755 "$clone"/deploy/bin/*.sh "$PLATTERLY_ROOT/bin/" || log "could not refresh $PLATTERLY_ROOT/bin (not fatal)"
log "done: $app is live on $idle ($sha). Roll back within $DRAIN_MINUTES minutes with: deploy/bin/rollback.sh $app"
