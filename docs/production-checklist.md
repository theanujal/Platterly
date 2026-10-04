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
