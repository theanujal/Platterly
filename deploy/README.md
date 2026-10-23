# Platterly deploy: blue/green, backups, monitoring

One VPS. Each app (catering, ops) has two slots, **blue** and **green**, each its own clone, build and systemd service on its own port
(catering 3000/3001, ops 3200/3201, loopback only). Nginx points at the live slot through a one-line upstream file that `deploy.sh`
rewrites. A release is built and proven healthy in the idle slot *before* any visitor is sent to it, so a bad build never serves traffic.
Both slots share the database (migrations are additive, `npm run check:migrations`), the uploads folder and the env files.

Nothing here is needed until go-live. The scripts are tested with stand-ins (`bash deploy/test/test-deploy.sh`), not yet on a real server.

## One-time server setup
1. Packages: Postgres 16, Nginx, Node 22 LTS or newer, git, curl, gpg. User: `useradd -m platterly`.
2. Folders: `mkdir -p /srv/platterly/{bin,env,state,uploads,site-media,backups,site} /etc/platterly /etc/nginx/platterly /var/log/platterly` and `chown -R platterly` them.
3. Env: copy `deploy/env/*.example` to `/srv/platterly/env/catering.env` and `ops.env`, fill them, `chmod 600`. Generate
   `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` once per app (`openssl rand -base64 32`). Copy `deploy/deploy.conf.example` to `/etc/platterly/deploy.conf`.
   Put the backup passphrase in `/etc/platterly/backup.pass` **and in your password manager** (without it the env copy in backups cannot be opened).
4. Scripts and service: copy `deploy/bin/*.sh` to `/srv/platterly/bin/` (chmod +x), and `deploy/systemd/platterly-app@.service` to
   `/etc/systemd/system/`, then `systemctl daemon-reload`.
5. Nginx: copy `deploy/nginx/platterly.conf` to `/etc/nginx/conf.d/`, add the certificate, and create `cloudflare-ips.conf` (Cloudflare's ranges as
   `set_real_ip_from`). Create the first upstream files so Nginx can start:
   `printf 'upstream platterly_catering { server 127.0.0.1:3000; }\n' > /etc/nginx/platterly/active-catering.conf` and the same for ops with 3200.
6. First deploy, as root: `/srv/platterly/bin/deploy.sh catering`, then `... ops`. Because blue is "live" by default, the first deploy lands in green and switches to it.
   `deploy.sh` and `rollback.sh` run as root, because they restart services and reload Nginx. The code is fetched, built and migrated as
   `platterly`, with that app's env file loaded (`as_app` in `lib.sh`), so the build sees `NEXT_PUBLIC_*` and Prisma sees `DATABASE_URL`.
7. Cron: copy `deploy/cron/platterly.cron` to `/etc/cron.d/platterly` and set `MAILTO`.
8. Marketing site: clone the repository to `/srv/platterly/site-repo` as `platterly`, copy `deploy/env/site-hook.env.example` to
   `/srv/platterly/env/site-hook.env` (`chmod 600`, `SITE_SECRET` from `openssl rand -hex 24`), and install `deploy/systemd/platterly-site-hook.service`.
   In `ops.env` set the same `SITE_SECRET` and `SITE_DEPLOY_HOOK_URL=http://127.0.0.1:3300/` (same server, so no public address is needed).
   Then press Publish in Ops (`docs/site-publish.md`).

## Every release
`deploy.sh catering` (or `ops`) builds the idle slot, runs the migration guard, backs up the database, runs migrations, starts the slot, waits for
`/api/health`, tests and reloads Nginx, then stops the old slot after `DRAIN_MINUTES`. Any failure before the switch leaves the live slot as it was.
Order for a release that touches both: **catering first, then ops** (`docs/production-checklist.md`).

- **Roll back:** `rollback.sh catering` (within the drain window it is instant; afterwards it restarts the old slot first).
- **See what is live:** `status.sh`.
- Rollback does not undo migrations. That is why migrations are additive; a destructive change ships in two releases (expand, then contract).

## Backups
`backup.sh` (nightly 02:15 and before each deploy) dumps both databases, archives uploads and site pictures, stores an encrypted copy of the env
files, verifies every dump by listing it back, and keeps 14 daily, 8 weekly and 12 monthly copies (`KEEP_*` in deploy.conf). `last-backup.json` shows the
result; `status.sh` prints it. `restore-drill.sh` (Sundays) restores the newest dump into scratch databases and checks row counts, so you learn a backup is bad
before you need it.

Restore for real: `pg_restore --clean --if-exists -d <db> <dump>` into the database, stop the slots first, then start them.

**Offsite copy (open decision):** backups on the same VPS do not survive losing the VPS. Set `BACKUP_OFFSITE_CMD` (for example an `rclone copy` wrapper to
a storage bucket you choose) so each run copies the files off the server. Until you choose one, only the VPS holds them.

## Error monitoring (Sentry)
Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in each env file (one Sentry project per app). Unset = off. Source-map upload only happens when
`SENTRY_AUTH_TOKEN` is set at build time (add it to `/etc/platterly/deploy.conf`). Releases are tagged with the git SHA.

## Files
Uploads live in `UPLOAD_ROOT` on the VPS only, outside the releases, so both slots see the same files; Nginx serves `/uploads/`. They are in the nightly backup.

## Lead form
Set `NEXT_PUBLIC_ENQUIRY_ENDPOINT=https://ops.platterly.in/api/public/enquiries` when building the marketing site, and `SITE_ORIGINS` in `ops.env`.
Leads appear under Leads in Ops.
