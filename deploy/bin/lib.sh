#!/usr/bin/env bash
# Shared helpers for the blue/green deploy scripts (deploy/README.md). Sourced, never run.
# Everything lives under PLATTERLY_ROOT (default /srv/platterly) and is read from /etc/platterly/deploy.conf when present.

PLATTERLY_ROOT="${PLATTERLY_ROOT:-/srv/platterly}"
CONF="${PLATTERLY_CONF:-/etc/platterly/deploy.conf}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"

REPO_URL="${REPO_URL:-git@github.com:theanujal/Platterly.git}"
NGINX_INCLUDE_DIR="${NGINX_INCLUDE_DIR:-/etc/nginx/platterly}"
STATE_DIR="${STATE_DIR:-$PLATTERLY_ROOT/state}"
ENV_DIR="${ENV_DIR:-$PLATTERLY_ROOT/env}"
UPLOAD_ROOT="${UPLOAD_ROOT:-$PLATTERLY_ROOT/uploads}"
BACKUP_DIR="${BACKUP_DIR:-$PLATTERLY_ROOT/backups}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"
# How long the slot that just stopped serving stays up, so a bad release can be rolled back at once.
DRAIN_MINUTES="${DRAIN_MINUTES:-10}"
SERVICE_USER="${SERVICE_USER:-platterly}"

# deploy.sh and rollback.sh run as root (they restart services and reload Nginx). The code itself is fetched, built and migrated
# as SERVICE_USER with the app's env file loaded: the release then belongs to the user that runs it (it writes .next/cache), the
# build sees NEXT_PUBLIC_* and NEXT_SERVER_ACTIONS_ENCRYPTION_KEY, and Prisma sees DATABASE_URL. Run as anyone else, only the env is loaded.
as_app() { # as_app <app> <dir> <command...>
  local run=(bash -c 'set -a; [ -f "$0" ] && . "$0"; set +a; cd "$1" && shift && exec "$@"' "$ENV_DIR/$1.env" "$2"); shift 2
  if [ "$(id -u)" -eq 0 ]; then runuser -u "$SERVICE_USER" -- env HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)" "${run[@]}" "$@"; else "${run[@]}" "$@"; fi
}
# A folder SERVICE_USER can write in (when running as root), for the slot clones.
app_mkdir() { mkdir -p "$1"; if [ "$(id -u)" -eq 0 ]; then chown "$SERVICE_USER:$SERVICE_USER" "$1"; fi; }

log() { printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${LOG_TAG:-deploy}" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

require_app() {
  case "$1" in catering|ops) ;; *) die "the app must be catering or ops (got '$1')" ;; esac
}

# The port each slot listens on (127.0.0.1 only; Nginx is the only way in).
port_of() {
  case "$1-$2" in
    catering-blue) echo "${CATERING_PORT_BLUE:-3000}" ;;
    catering-green) echo "${CATERING_PORT_GREEN:-3001}" ;;
    ops-blue) echo "${OPS_PORT_BLUE:-3200}" ;;
    ops-green) echo "${OPS_PORT_GREEN:-3201}" ;;
    *) die "unknown slot $1-$2" ;;
  esac
}

other_slot() { [ "$1" = blue ] && echo green || echo blue; }
slot_dir() { echo "$PLATTERLY_ROOT/$1/$2"; }
unit_of() { echo "platterly-app@$1-$2"; }
# Where the app's own package lives inside a clone: the catering app is the repository root, ops is apps/ops.
app_dir() { [ "$1" = ops ] && echo "$2/apps/ops" || echo "$2"; }

active_slot() {
  local file="$STATE_DIR/$1.active"
  if [ -f "$file" ]; then tr -d '[:space:]' < "$file"; else echo blue; fi
}
previous_slot() {
  local file="$STATE_DIR/$1.previous"
  if [ -f "$file" ]; then tr -d '[:space:]' < "$file"; fi
}

# The health URL answers on the slot's own port, whatever host name the public site uses.
health_url() { echo "http://127.0.0.1:$(port_of "$1" "$2")/api/health"; }

wait_healthy() {
  local app="$1" slot="$2" waited=0
  local url; url="$(health_url "$app" "$slot")"
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    if curl -fsS -m 5 "$url" 2>/dev/null | grep -q '"status":"ok"'; then log "$app-$slot is healthy"; return 0; fi
    sleep 2; waited=$((waited + 2))
  done
  return 1
}

# Points Nginx at a slot: rewrites the upstream file atomically, tests the config, reloads (graceful: no dropped requests).
# If Nginx refuses the new config the old file is put back and nothing changes.
switch_traffic() {
  local app="$1" slot="$2"
  local target="$NGINX_INCLUDE_DIR/active-$app.conf" tmp="$NGINX_INCLUDE_DIR/.active-$app.conf.new" keep="$NGINX_INCLUDE_DIR/.active-$app.conf.old"
  mkdir -p "$NGINX_INCLUDE_DIR"
  [ -f "$target" ] && cp "$target" "$keep"
  printf '# Written by deploy.sh: %s is served by the %s slot.\nupstream platterly_%s {\n    server 127.0.0.1:%s;\n    keepalive 16;\n}\n' "$app" "$slot" "$app" "$(port_of "$app" "$slot")" > "$tmp"
  mv "$tmp" "$target"
  if ! nginx -t >/dev/null 2>&1; then
    [ -f "$keep" ] && mv "$keep" "$target"
    die "nginx refused the new config; traffic was not moved"
  fi
  nginx -s reload
  mkdir -p "$STATE_DIR"
  local old; old="$(active_slot "$app")"
  [ "$old" != "$slot" ] && printf '%s\n' "$old" > "$STATE_DIR/$app.previous"
  printf '%s\n' "$slot" > "$STATE_DIR/$app.active"
  log "traffic for $app now goes to $slot"
}

record_release() {
  mkdir -p "$STATE_DIR"
  printf '%s %s %s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$1" "$2" "$3" >> "$STATE_DIR/releases.log"
}
