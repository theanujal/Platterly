#!/usr/bin/env bash
# Blue/green deploy of one app (deploy/README.md).
#   deploy.sh catering [git-ref]      deploy.sh ops [git-ref]      deploy.sh platform [git-ref]        (default ref: origin/main)
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
if [ ! -d "$clone/.git" ]; then app_mkdir "$(dirname "$clone")"; as_app "$app" "$(dirname "$clone")" git clone "$REPO_URL" "$clone"; fi
as_app "$app" "$clone" git -C "$clone" fetch --prune origin
sha="$(as_app "$app" "$clone" git -C "$clone" rev-parse "$ref")"
as_app "$app" "$clone" git -C "$clone" checkout --detach "$sha"
log "checked out $sha"

# 1b. Catering has no login of its own: people sign in at the Platform (central sign-in). A catering release must never go live while that sign-in is
# missing or unreachable, or every kitchen is locked out. So the Platform has to be deployed first (docs/go-live-order.md).
if [ "$app" = catering ]; then
  as_app "$app" "$clone" bash -c 'test -n "${PLATFORM_AUTH_ORIGIN:-}" && curl -fsS --max-time 10 "$PLATFORM_AUTH_ORIGIN/api/auth/.well-known/openid-configuration" >/dev/null' \
    || die "Platterly's central sign-in is not answering (PLATFORM_AUTH_ORIGIN unset or unreachable). Deploy and check the Platform first, or catering has no way to sign in. Nothing was changed."
fi

# 1c. The business link with the Platform: without both secrets catering answers 404 to the Platform, so the membership event that adopts a business (and every
# later one) never arrives. They come from go-live step 3c (the register-product runner). Nothing is changed when they are missing.
if [ "$app" = catering ]; then
  as_app "$app" "$clone" bash -c 'test -n "${PLATFORM_COMMAND_SECRETS:-}" && test -n "${PLATFORM_ANSWER_SECRET:-}"' \
    || die "PLATFORM_COMMAND_SECRETS or PLATFORM_ANSWER_SECRET is not set in catering.env. Register Caterly with the Platform first (docs/go-live-order.md step 3c) and put both secrets in the env file. Nothing was changed."
fi

# 1d. The mail guard is ON unless MAIL_GUARD=off: real email then goes only to the allowed address. Right before go-live, wrong after it (sign-in codes, password
# resets and customer email would be skipped without any error), so every deploy says which it is. A warning, not a stop: before go-live the guard should stay on.
if as_app "$app" "$clone" bash -c '[ "$(printf %s "${MAIL_GUARD:-}" | tr "[:upper:]" "[:lower:]" | tr -d " ")" = off ]'; then
  log "mail guard is OFF for $app: real email is sent to everyone"
else
  log "WARNING: the mail guard is ON for $app (MAIL_GUARD is not off in $app.env): real email goes only to the allowed address. Correct before go-live; at go-live set MAIL_GUARD=off (docs/go-live-order.md step 6b)."
fi

# 2. Build, as the service user with the app's env loaded (lib.sh as_app). The migration guard first, so a release that could lose
# data never gets as far as the database.
if [ "$app" = ops ]; then
  as_app "$app" "$clone" node scripts/check-migrations.mjs
  as_app "$app" "$dir" npm ci
elif [ "$app" = platform ]; then
  # Covers the Platform's Prisma migrations and its identity database's numbered .sql files (the database with everyone's passwords).
  as_app "$app" "$clone" node scripts/check-migrations.mjs
  as_app "$app" "$dir" npm ci
else
  as_app "$app" "$clone" npm ci
  as_app "$app" "$clone" npm run check:migrations
fi
as_app "$app" "$dir" npm run build

# 3. Database: backup, then only additive migrations (both slots share the database, so the live slot keeps working).
# Order for a release that touches several apps: Platform, then Ops, then catering (docs/go-live-order.md).
as_app "$app" "$PLATTERLY_ROOT" "$HERE/backup.sh" --db-only --tag "pre-deploy-$app-${sha:0:8}"
as_app "$app" "$dir" npx prisma migrate deploy
# The Platform has a second database, the identity one (people, passwords, sessions), with its own numbered SQL migrations.
if [ "$app" = platform ]; then as_app "$app" "$dir" npm run identity:migrate; fi

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
# Only the live slot starts on boot (disable does not stop the old one, so the drain still works).
{ systemctl enable "$(unit_of "$app" "$idle")" && systemctl disable "$(unit_of "$app" "$active")"; } || log "could not set $idle to start on boot; run: systemctl enable $(unit_of "$app" "$idle") && systemctl disable $(unit_of "$app" "$active")"
if [ "$DRAIN_MINUTES" -gt 0 ]; then
  systemd-run --quiet --on-active="${DRAIN_MINUTES}m" --unit="platterly-drain-$app-$active" systemctl stop "$(unit_of "$app" "$active")" || log "could not schedule stopping $active; stop it by hand when you are sure"
fi
# The scripts themselves ship with the release: the next deploy and the systemd units use the newest copy.
mkdir -p "$PLATTERLY_ROOT/bin" && install -m 0755 "$clone"/deploy/bin/*.sh "$PLATTERLY_ROOT/bin/" || log "could not refresh $PLATTERLY_ROOT/bin (not fatal)"
log "done: $app is live on $idle ($sha). Roll back within $DRAIN_MINUTES minutes with: deploy/bin/rollback.sh $app"
