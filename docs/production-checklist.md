# Production Checklist

| Item | Check |
|---|---|
| Env: DATABASE_URL, BETTER_AUTH_SECRET, PAYMENT_SECRETS_KEY (32-byte), CRON_SECRET, Razorpay platform keys, mail keys | Set; none committed |
| `prisma migrate deploy` | Run before start |
| Cron: `/api/cron/daily` with CRON_SECRET | Scheduled every minute (webhook retries) |
| Razorpay webhooks | Per-kitchen and platform URLs configured, amount check on capture |
| TLS/Cloudflare/Nginx | https only; wildcard host for catering subdomain |
| Rate limiting | In-memory, single instance only |
| Backups | Postgres daily + restore drill |
| Monitoring | Sentry DSN; log review |
| WhatsApp | Not implemented (Pending) |
| Ops link: `OPS_BASE_URL`, `OPS_EVENT_SECRET`, `OPS_COMMAND_SECRETS`, `OPS_PRODUCT_KEY` | Set from the ops registry (Products); ops `OPS_SECRETS_KEY` set and never changed; link off if unset |
| Ops app (`apps/ops`) | Own database and `prisma migrate deploy`; `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; Nginx routes `ops.platterly.in` to it; staff created with `npm run ops:create-staff` |
| Cron for the ops link | Same `/api/cron/daily` job; every minute or two so events are retried and a first catch-up drains (50 per run) |
| Billing cutover (`OPS_BILLING=1`) | Only after: catering backup, `ops:import-catering` dry run then `--apply` (raises ops invoice sequence), ops `RAZORPAY_*` + webhook `/api/webhooks/razorpay`, ops cron every minute or two, then a real sign-up and payment check. Roll back by unsetting it. |
| Marketing site publish (`docs/site-publish.md`) | Ops `SITE_SECRET` + `SITE_DEPLOY_HOOK_URL`; the hook (`scripts/site-deploy-hook.mjs`) running on the VPS with the same secret; Nginx root `.../current`; `npm run ops:import-site -- --apply` once before the first Publish |
| Website pictures (`docs/site-publish.md`) | Ops `SITE_MEDIA_DIR` on a persistent, backed-up folder; included in the Postgres backup routine |
| Duplicate-name check (before migrate) | `psql "$DATABASE_URL" -f scripts/pre-migrate-duplicate-check.sql` must return no rows for food items and inventory, else `migrate deploy` fails on the unique indexes |
| Migration order | Catering `prisma migrate deploy` first (includes `library_candidates`, food item and inventory unique names, catalogs), then Ops `prisma migrate deploy` in `apps/ops` |
| Master catalogs | `npm run db:seed-catalog` after the catering migration (529 dishes, 335 ingredients); safe to repeat |
| Library review cron | `/api/cron/daily` runs the nightly scan (once a day); Ops `/api/cron` pulls candidates every 30 minutes; both need their cron secrets |
| Library categories and photos | Migrations `library_categories` (seeds the category list from the standard 10 plus any category library dishes use) and `menu_item_image_source_backfill` ship with the catering migrate; `npm run db:seed-catalog` adds catalog categories. `LIBRARY_PHOTO_MIN_KITCHENS` (default 1) sets how many kitchens' own photos make a photo candidate; uploaded files live under `public/uploads/library/` (include in backups; with R2 later, the storage driver needs `read`) |
