#!/usr/bin/env bash
# Puts traffic back on the slot that was live before the last deploy (deploy/README.md).
#   rollback.sh catering        rollback.sh ops
# The previous slot is started if the drain already stopped it (its build is still on disk), checked, and only then does Nginx move back.
# A migration is never undone: releases only add to the database, so the old code keeps working against it.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
LOG_TAG="rollback"

app="${1:-}"
require_app "$app"
current="$(active_slot "$app")"; back="$(previous_slot "$app")"
[ -n "$back" ] || die "there is no previous slot recorded for $app (nothing to roll back to)"
[ -d "$(slot_dir "$app" "$back")" ] || die "the $back slot's folder is missing"
log "rolling $app back from $current to $back"
# A drain that has not fired yet must not stop the slot we are going back to.
systemctl stop "platterly-drain-$app-$back.timer" 2>/dev/null || true
systemctl restart "$(unit_of "$app" "$back")"
wait_healthy "$app" "$back" || die "the $back slot is not healthy; traffic stays on $current"
switch_traffic "$app" "$back"
record_release "$app" "$back" "rollback-from-$current"
{ systemctl enable "$(unit_of "$app" "$back")" && systemctl disable "$(unit_of "$app" "$current")"; } || log "could not set $back to start on boot; run: systemctl enable $(unit_of "$app" "$back") && systemctl disable $(unit_of "$app" "$current")"
log "done: $app is live on $back. The $current slot is left running for you to look at; stop it with: systemctl stop $(unit_of "$app" "$current")"
