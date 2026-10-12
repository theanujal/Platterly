#!/usr/bin/env bash
# Backs up Platterly: both Postgres databases (catering and ops), the uploads folder and Ops's website pictures, and an encrypted copy
# of the env files. Runs nightly from cron and before every deploy that migrates (deploy.sh calls it with --db-only).
#   backup.sh [--db-only] [--tag NAME]
# Every dump is checked by listing it back (a backup that cannot be read is a failed backup), copied offsite if configured, and the
# result is written to $BACKUP_DIR/last-backup.json. Exit code is non-zero on any failure, so cron mails you.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
LOG_TAG="backup"

db_only=0; tag=""
while [ $# -gt 0 ]; do
  case "$1" in --db-only) db_only=1 ;; --tag) tag="${2:?--tag needs a name}"; shift ;; *) die "unknown option $1" ;; esac
  shift
done

stamp="$(date '+%Y%m%d-%H%M%S')"
suffix="${tag:+-$tag}"
daily="$BACKUP_DIR/daily"; mkdir -p "$daily"
SITE_MEDIA_DIR="${SITE_MEDIA_DIR:-$PLATTERLY_ROOT/site-media}"
files=()

# DATABASE_URL of an app, from its env file (without the ?schema= part Prisma adds, which pg_dump does not know).
db_url() {
  local file="$ENV_DIR/$1.env"
  [ -f "$file" ] || die "missing $file"
  local url; url="$(grep -E '^DATABASE_URL=' "$file" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
  [ -n "$url" ] || die "no DATABASE_URL in $file"
  echo "${url%%\?*}"
}

dump_db() {
  local app="$1"
  local out="$daily/$app-$stamp$suffix.dump"
  log "dumping the $app database"
  pg_dump --format=custom --no-owner --file "$out" "$(db_url "$app")"
  # Read it back: the table of contents must list, and the file must not be empty.
  [ -s "$out" ] || die "$out is empty"
  pg_restore --list "$out" >/dev/null || die "$out cannot be read back"
  ( cd "$daily" && shasum -a 256 "$(basename "$out")" > "$(basename "$out").sha256" )
  files+=("$out")
}

archive_dir() {
  local name="$1" src="$2"
  local out="$daily/$name-$stamp$suffix.tar.gz"
  if [ ! -d "$src" ]; then log "no $src yet; skipping $name"; return 0; fi
  log "archiving $src"
  tar -czf "$out" -C "$src" .
  tar -tzf "$out" >/dev/null || die "$out cannot be read back"
  files+=("$out")
}

dump_db catering
dump_db ops
if [ "$db_only" -eq 0 ]; then
  archive_dir uploads "$UPLOAD_ROOT"
  archive_dir site-media "$SITE_MEDIA_DIR"
  # The env files hold the keys that make saved data readable (OPS_SECRETS_KEY, PAYMENT_SECRETS_KEY...): without them a restored
  # database is not enough. They are only kept encrypted, with the passphrase in a file only root can read.
  if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ] && [ -f "$BACKUP_PASSPHRASE_FILE" ]; then
    command -v gpg >/dev/null || die "BACKUP_PASSPHRASE_FILE is set but gpg is not installed (apt install gnupg)"
    out="$daily/env-$stamp$suffix.tar.gz.gpg"
    tar -czf - -C "$ENV_DIR" . | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$BACKUP_PASSPHRASE_FILE" -o "$out"
    files+=("$out")
  else
    log "BACKUP_PASSPHRASE_FILE is not set: the env files are NOT in this backup (keep them in your password manager)"
  fi
fi

# Weekly (Sunday) and monthly (the 1st) copies are kept longer, as hard links so they take no extra room.
if [ -z "$tag" ]; then
  if [ "$(date +%u)" = 7 ]; then mkdir -p "$BACKUP_DIR/weekly" && for f in "${files[@]}"; do ln -f "$f" "$BACKUP_DIR/weekly/" 2>/dev/null || cp -p "$f" "$BACKUP_DIR/weekly/"; done; fi
  if [ "$(date +%d)" = 01 ]; then mkdir -p "$BACKUP_DIR/monthly" && for f in "${files[@]}"; do ln -f "$f" "$BACKUP_DIR/monthly/" 2>/dev/null || cp -p "$f" "$BACKUP_DIR/monthly/"; done; fi
fi

# Offsite copy, when one is configured (a second place is what protects against losing the server itself).
if [ -n "${BACKUP_OFFSITE_CMD:-}" ]; then
  log "copying offsite"
  # BACKUP_OFFSITE_CMD is a command that takes the files as arguments, for example: rclone copy --no-traverse (see README).
  # shellcheck disable=SC2086
  $BACKUP_OFFSITE_CMD "${files[@]}" || die "the offsite copy failed"
fi

# Pruning by age: dailies (and the pre-deploy ones) 14 days, weekly copies 8 weeks, monthly copies 6 months. A weekly or monthly copy
# is a hard link, so deleting the daily one never loses it.
KEEP_DAILY_DAYS="${KEEP_DAILY_DAYS:-14}"; KEEP_WEEKLY_DAYS="${KEEP_WEEKLY_DAYS:-56}"; KEEP_MONTHLY_DAYS="${KEEP_MONTHLY_DAYS:-183}"
prune() { local dir="$1" days="$2"; [ -d "$dir" ] && find "$dir" -type f -mtime "+$days" -delete || true; }
prune "$daily" "$KEEP_DAILY_DAYS"; prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY_DAYS"; prune "$BACKUP_DIR/monthly" "$KEEP_MONTHLY_DAYS"

bytes=0; for f in "${files[@]}"; do bytes=$((bytes + $(wc -c < "$f"))); done
printf '{"ok":true,"at":"%s","tag":"%s","files":%s,"bytes":%s}\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$tag" "${#files[@]}" "$bytes" > "$BACKUP_DIR/last-backup.json"
log "done: ${#files[@]} files, $bytes bytes in $daily"
