# Platterly Ops

The control plane for every Platterly product. Its own Next.js app with its own database (`platterly_ops`); it shares only `packages/contract` with the other apps. The rules it follows are in `docs/ops-contract.md`.

## What is built (step 3)

- **Staff login**: Better Auth, separate from every product's logins. No sign-up page; create staff with `npm run ops:create-staff -- "Full Name" name@platterly.in` (password from `OPS_STAFF_PASSWORD` or a prompt).
- **Product registry** (`/products`): register a product (key, name, base URL), get its two signing secrets once, rotate them (old ones stay valid until you finish the rotation), disable it, read its manifest.
- **Business directory** (`/businesses`): filled from `business.signed_up` events; usage counts from `usage.reported`; owner changes from `owner.changed`.
- **Alerts** (`/alerts`): from `alert.raised` and sign-ups; acknowledge when handled.
- **Event receiver** `POST /api/products/events`: finds the product, verifies the signature, validates, de-duplicates by event id, applies. A product can only change businesses it registered itself.
- **Audit log**: every operator change is written to `audit_log`.

Not built yet: plans, subscriptions, billing, messaging, commands to products (steps 4 to 8 in the contract doc).

## Run it

```
cp .env.example .env        # fill DATABASE_URL (platterly_ops) and BETTER_AUTH_SECRET
npx prisma migrate deploy
npm run dev                 # http://ops.localhost:3200
npm test                    # Vitest against the ops database
npx playwright test -c apps/ops/e2e/playwright.config.ts   # from the repo root; clean up after itself
```

Dev ports: catering 3000, marketing site 3100 (static preview server 3300), ops 3200.

## Layout

- `src/modules/registry`: product registry, secrets, manifest refresh.
- `src/modules/directory`: event receiver and business queries.
- `src/modules/alerts`: alert list and acknowledge.
- `src/lib`: db, auth, session, audit, secret box (AES-256-GCM, key `OPS_SECRETS_KEY`).
- `prisma/schema.prisma`: staff (Better Auth), product, business, business_product, inbound_event, alert, audit_log.
