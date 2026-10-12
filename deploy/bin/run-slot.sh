#!/usr/bin/env bash
# What systemd runs for one slot: platterly-app@<app>-<slot>. Loads the app's env file, then starts Next.js on the slot's port,
# listening on 127.0.0.1 only (Nginx is the only way in).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
instance="${1:?usage: run-slot.sh <app>-<slot>}"
app="${instance%-*}"; slot="${instance##*-}"
require_app "$app"
case "$slot" in blue|green) ;; *) die "unknown slot '$slot'" ;; esac
dir="$(app_dir "$app" "$(slot_dir "$app" "$slot")")"
[ -d "$dir/.next" ] || die "$app-$slot has no build yet ($dir/.next); run deploy.sh $app first"
set -a
# shellcheck disable=SC1090
. "$ENV_DIR/$app.env"
set +a
export NODE_ENV=production PORT="$(port_of "$app" "$slot")" HOSTNAME=127.0.0.1 UPLOAD_ROOT
# Both slots must read each other's Server Action calls and cache keys: set NEXT_SERVER_ACTIONS_ENCRYPTION_KEY in the env file (README).
cd "$dir"
exec node_modules/.bin/next start -p "$PORT" -H 127.0.0.1
