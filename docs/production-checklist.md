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
