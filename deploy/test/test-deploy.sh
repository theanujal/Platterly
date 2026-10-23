#!/usr/bin/env bash
# Tests the blue/green scripts without a server: git, npm, systemctl, nginx and curl are replaced by small stand-ins that record what was
# asked of them. Proves the slot logic: the idle slot is built and checked first, traffic moves only after it is healthy, a bad slot or a bad
# nginx config leaves the live slot alone, and rollback goes back. Run: bash deploy/test/test-deploy.sh
set -uo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
fails=0
ok() { printf '  ok   %s\n' "$1"; }
bad() { printf '  FAIL %s\n' "$1"; fails=$((fails + 1)); }
assert_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (got '$1', wanted '$2')"; fi; }
assert_contains() { if grep -q -- "$2" "$1" 2>/dev/null; then ok "$3"; else bad "$3 (no '$2' in $1)"; fi; }

# --- a fake server ---------------------------------------------------------------------------------------------------------------
ROOT="$T/srv"; BIN="$T/fakebin"; CALLS="$T/calls.log"; mkdir -p "$ROOT/bin" "$ROOT/state" "$ROOT/env" "$BIN" "$T/nginx"
cp "$SRC"/bin/*.sh "$ROOT/bin/"
printf '#!/usr/bin/env bash\necho "backup $*" >> "%s"\n' "$CALLS" > "$ROOT/bin/backup.sh"; chmod +x "$ROOT/bin/backup.sh"   # the real one is tested on its own
stub() { printf '#!/usr/bin/env bash\n%s\n' "$2" > "$BIN/$1"; chmod +x "$BIN/$1"; }
stub git 'echo "git $*" >> "'"$CALLS"'"
case "$1 $2" in
  "clone "*) mkdir -p "${3}/.git" "${3}/apps/ops" "${3}/deploy/bin"; cp "'"$ROOT"'"/bin/*.sh "${3}/deploy/bin/" ;;
esac
if [ "$1" = "-C" ] && [ "$3" = "rev-parse" ]; then if [ "$4" = "--short" ]; then echo abc1234; else echo "${FAKE_SHA:-1111111111111111111111111111111111111111}"; fi; fi
exit 0'
stub npm 'echo "npm $* (in $PWD) url=${NEXT_PUBLIC_APP_URL:-}" >> "'"$CALLS"'"; exit 0'
stub npx 'echo "npx $* (in $PWD) db=${DATABASE_URL:-}" >> "'"$CALLS"'"; exit 0'
printf 'NEXT_PUBLIC_APP_URL="https://catering.test"\nDATABASE_URL="postgresql://catering-db"\n' > "$ROOT/env/catering.env"
stub node 'echo "node $*" >> "'"$CALLS"'"; exit 0'
stub systemctl 'echo "systemctl $*" >> "'"$CALLS"'"; [ "$1" = is-active ] && echo active; exit 0'
stub systemd-run 'echo "systemd-run $*" >> "'"$CALLS"'"; exit 0'
stub journalctl 'exit 0'
stub nginx 'echo "nginx $*" >> "'"$CALLS"'"; if [ "$1" = "-t" ] && [ -f "'"$T"'/nginx-broken" ]; then exit 1; fi; exit 0'
# curl answers healthy unless a marker file for that port exists.
stub curl 'url="${@: -1}"; port="$(echo "$url" | sed -E "s#.*:([0-9]+)/.*#\1#")"; if [ -f "'"$T"'/unhealthy-$port" ]; then exit 22; fi; echo "{\"status\":\"ok\"}"'
export PATH="$BIN:$PATH" PLATTERLY_ROOT="$ROOT" PLATTERLY_CONF=/nonexistent NGINX_INCLUDE_DIR="$T/nginx" HEALTH_TIMEOUT=4 DRAIN_MINUTES=10
D="$ROOT/bin/deploy.sh"; R="$ROOT/bin/rollback.sh"
upstream() { grep -o 'server 127.0.0.1:[0-9]*' "$T/nginx/active-$1.conf" | cut -d: -f2; }
active() { tr -d '[:space:]' < "$ROOT/state/$1.active"; }

echo "first deploy of catering: blue is live by default, so the build goes to green"
: > "$CALLS"
"$D" catering origin/main >>"$T/out.log" 2>&1; rc=$?
assert_eq "$rc" 0 "deploy exits 0"
assert_eq "$(active catering)" green "traffic moved to green"
assert_eq "$(upstream catering)" 3001 "nginx upstream is green's port (3001)"
assert_contains "$CALLS" "systemctl restart platterly-app@catering-green" "the idle (green) slot was started"
assert_contains "$CALLS" "backup --db-only --tag pre-deploy-catering-11111111" "the database was backed up before migrating"
assert_contains "$CALLS" "npx prisma migrate deploy" "migrations were applied"
assert_contains "$CALLS" "npm run build (in $ROOT/catering/green) url=https://catering.test" "the build sees the app's env file (NEXT_PUBLIC_*)"
assert_contains "$CALLS" "db=postgresql://catering-db" "the migration sees the app's DATABASE_URL"
assert_contains "$CALLS" "systemd-run --quiet --on-active=10m --unit=platterly-drain-catering-blue" "the old (blue) slot is scheduled to stop after the drain"
assert_contains "$CALLS" "systemctl enable platterly-app@catering-green" "the new live (green) slot starts on boot"
assert_contains "$CALLS" "systemctl disable platterly-app@catering-blue" "the old (blue) slot no longer starts on boot"
assert_contains "$ROOT/state/releases.log" "catering green 1111111111" "the release was recorded"
# Order: backup, then migrate, then start, then nginx reload.
b=$(grep -n "^backup" "$CALLS" | head -1 | cut -d: -f1); m=$(grep -n "prisma migrate" "$CALLS" | head -1 | cut -d: -f1); s=$(grep -n "systemctl restart" "$CALLS" | head -1 | cut -d: -f1); n=$(grep -n "nginx -s reload" "$CALLS" | head -1 | cut -d: -f1)
if [ "$b" -lt "$m" ] && [ "$m" -lt "$s" ] && [ "$s" -lt "$n" ]; then ok "order: backup, migrate, start the idle slot, then move traffic"; else bad "order wrong ($b $m $s $n)"; fi

echo "second deploy: the other way round"; 
"$D" catering origin/main >"$T/out.log" 2>&1
assert_eq "$(active catering)" blue "traffic moved back to blue"
assert_eq "$(upstream catering)" 3000 "nginx upstream is blue's port (3000)"
assert_eq "$(tr -d '[:space:]' < "$ROOT/state/catering.previous")" green "green is remembered as the previous slot"

echo "a slot that does not come up healthy never gets traffic"
touch "$T/unhealthy-3001"; : > "$CALLS"
"$D" catering origin/main >>"$T/out.log" 2>&1; rc=$?
if [ "$rc" -ne 0 ]; then ok "deploy fails"; else bad "deploy should fail"; fi
assert_eq "$(active catering)" blue "blue is still live"
assert_eq "$(upstream catering)" 3000 "nginx still points at blue"
assert_contains "$CALLS" "systemctl stop platterly-app@catering-green" "the unhealthy slot was stopped"
if grep -q "nginx -s reload" "$CALLS"; then bad "nginx was reloaded"; else ok "nginx was not touched"; fi
rm -f "$T/unhealthy-3001"

echo "an nginx config that fails its test leaves the old one in place"
touch "$T/nginx-broken"
"$D" catering origin/main >>"$T/out.log" 2>&1; rc=$?
if [ "$rc" -ne 0 ]; then ok "deploy fails"; else bad "deploy should fail"; fi
assert_eq "$(active catering)" blue "state still says blue"
assert_eq "$(upstream catering)" 3000 "the upstream file was put back"
rm -f "$T/nginx-broken"

echo "rollback"
"$D" catering origin/main >>"$T/out.log" 2>&1   # blue -> green again
assert_eq "$(active catering)" green "live on green"
: > "$CALLS"
"$R" catering >/dev/null 2>&1; rc=$?
assert_eq "$rc" 0 "rollback exits 0"
assert_eq "$(active catering)" blue "back on blue"
assert_eq "$(upstream catering)" 3000 "nginx back on 3000"
assert_contains "$CALLS" "systemctl restart platterly-app@catering-blue" "blue was started again if the drain had stopped it"
assert_contains "$CALLS" "systemctl stop platterly-drain-catering-blue.timer" "a pending drain of blue was cancelled"
assert_contains "$CALLS" "systemctl enable platterly-app@catering-blue" "blue starts on boot again"
assert_contains "$CALLS" "systemctl disable platterly-app@catering-green" "green no longer starts on boot"
touch "$T/unhealthy-3001"; rm -f "$ROOT/state/catering.previous"; printf 'green\n' > "$ROOT/state/catering.previous"
"$R" catering >/dev/null 2>&1; rc=$?
if [ "$rc" -ne 0 ]; then ok "rollback to an unhealthy slot refuses"; else bad "rollback should refuse"; fi
assert_eq "$(active catering)" blue "traffic stays where it was"
rm -f "$T/unhealthy-3001"

echo "ops uses its own slots, ports and folder"
"$D" ops origin/main >>"$T/out.log" 2>&1
assert_eq "$(active ops)" green "ops moved to green"
assert_eq "$(upstream ops)" 3201 "ops upstream is 3201"
assert_contains "$CALLS" "npx prisma migrate deploy (in $ROOT/ops/green/apps/ops)" "ops migrations run in apps/ops"
assert_eq "$(active catering)" blue "catering was not touched"

echo "a bad app name is refused"
"$D" billing >/dev/null 2>&1; rc=$?
if [ "$rc" -ne 0 ]; then ok "refused"; else bad "should refuse"; fi

[ "$fails" -ne 0 ] && { echo "--- deploy output ---"; tail -40 "$T/out.log"; }
if [ "$fails" -eq 0 ]; then echo "ALL OK"; else echo "$fails FAILED"; exit 1; fi
