# Ops ↔ Product Contract (draft v1)

Status: **v1 approved by AJ on 2026-10-05 (open questions answered, see section 13). No code is written against it yet.**

Ops is the control plane. A product (catering today; restaurant, reviews and others later) is a data plane with its own app and its own database. They talk only through this contract. Ops never reads a product database, and a product never reads the ops database.

## 1. Scope

| Owned by ops (own DB) | Owned by each product (own DB) |
|---|---|
| Business directory (one global `businessId`) | All domain data (orders, menus, customers, tables, reviews, ...) |
| Product registry | Team, roles, tenant settings |
| Plans, subscriptions, trials, invoices, GST invoices | Enforcing entitlements (from a local snapshot) |
| Platterly's own Razorpay keys, checkout and webhook | The lock screen (design and text) |
| Messages from Platterly to a business owner | The business's own Razorpay / UPI keys, payment links, receipts, customer invoices |
| Platform notice, platform alerts, cross-product analytics | The business's messages to its own customers |
| Ops staff login, roles and ops audit log | Product audit log |

**Not moved, by AJ's decision:** each kitchen's own Razorpay and UPI. Ops never touches money collected from a business's customers.

## 2. Identifiers

- `businessId`: `biz_<32 hex>`, opaque, never reused. Minted by whichever side creates the business first: the product at self-serve sign-up (it sends the id in `business.signed_up`), or ops when an operator creates a business (it sends the id in `business.provision`). The other side accepts it. Ops is the registry of record: a product can only touch businesses it registered itself, and a second product can join an existing business without changing its name or owner.
- `productKey`: stable lowercase key (`catering`, `restaurant`, ...). Matches the registry and the subdomain.
- `subscriptionId`: ops id for one Business + Product subscription.
- `eventId`: `evt_<32 hex>`, unique per event, reused on retry so receivers can de-duplicate.

A business's email is the human contact, not the join key. The join key is `businessId`.

## 3. Transport and security

Reuse the scheme already shipped in Chunk 25 (`src/modules/webhooks/signing.ts`):

- HTTPS only. JSON body.
- Headers: `X-Platterly-Timestamp` (unix seconds), `X-Platterly-Signature: v1=<hex>` = HMAC-SHA256(secret, `"<timestamp>.<raw body>"`), `X-Platterly-Event-Id`, `X-Platterly-Contract: 1`.
- Reject a timestamp older than 300 seconds. Compare signatures in constant time.
- One shared secret **per product, per direction** (ops→product, product→ops). Stored encrypted. Rotation: two secrets valid at once during a rotation window.
- Private, loopback and metadata addresses refused (existing SSRF guard) unless the product is registered on a trusted internal address. The registry holds a base URL per product and per direction. Same-server hosting sets it to a local address, a separate server sets it to a public HTTPS URL. No code may assume localhost.
- Responses: 2xx accepted. 4xx (except 408/429) is permanent, and so is 501 (not built yet). Other 5xx and timeouts retry at 1m, 5m, 30m, 2h, 12h.
- Every command is idempotent. The same `eventId` or `commandId` twice has the same effect as once.

## 4. Product manifest

Each product publishes a manifest at `GET /api/ops/manifest` (signed). Ops reads it to register the product and to render generic screens.

```json
{
  "contract": 1,
  "productKey": "catering",
  "name": "Catering",
  "version": "2026.10.05",
  "baseUrl": "https://catering.platterly.in",
  "internalBaseUrl": "http://127.0.0.1:3000",
  "entitlements": [
    { "key": "maxCustomers", "type": "limit", "label": "Customers" },
    { "key": "maxOrders", "type": "limit", "label": "Orders" },
    { "key": "multiLocation", "type": "flag", "label": "Multiple locations" }
  ],
  "trial": { "days": 7, "entitlements": { "maxCustomers": 50, "multiLocation": false } },
  "events": ["business.signed_up", "usage.reported", "alert.raised"],
  "messageTemplates": ["welcome_owner", "trial_ending", "payment_failed"],
  "tabs": [{ "key": "overview", "label": "Overview" }, { "key": "team", "label": "Team" }],
  "actions": ["suspend", "reactivate"]
}
```

- `type: "limit"` is a number or `null` (unlimited). `type: "flag"` is a boolean. `type: "text"` is a short string. New types need a contract version bump.
- Ops builds its plan editor from `entitlements`. A new product adds no ops schema change.
- Ops stores the manifest version it last read. A manifest change that removes a key is flagged in ops before it takes effect.

## 5. Entitlement snapshot

The small record a product stores locally and checks on every request. No call to ops on the hot path.

```json
{
  "businessId": "biz_...",
  "productKey": "catering",
  "subscriptionId": "sub_...",
  "version": 17,
  "plan": { "code": "pro", "name": "Pro" },
  "status": "ACTIVE",
  "interval": "MONTHLY",
  "currentPeriodEnd": "2026-11-05T00:00:00Z",
  "trialEndsAt": null,
  "entitlements": { "maxCustomers": 5000, "maxOrders": null, "multiLocation": true },
  "issuedAt": "2026-10-05T09:00:00Z",
  "validUntil": "2026-10-12T09:00:00Z"
}
```

- `status` is one of `TRIALING`, `ACTIVE`, `PAST_DUE`, `LOCKED`, `CANCELLED`.
- `version` only goes up. A product ignores a snapshot with a lower or equal version.
- `validUntil` is when the snapshot stops being trusted unless refreshed. Ops sets it to about 7 days after issue and refreshes it on every push.
- The product stores the snapshot keyed by `businessId`. Catering keeps it next to the `Organization` row it already has.

### What the product does with it

| Check | Rule |
|---|---|
| Can the business use the product? | `TRIALING`, `ACTIVE` and `PAST_DUE` yes. `LOCKED` and `CANCELLED` show the lock screen. |
| Limit | `null` means unlimited. Otherwise block the add when usage is at or above the number (today's `assertWithinPlanLimit`). |
| Flag | `true` or `false` (today's `hasMultiLocationPlan`). |
| Snapshot missing | Treat as `LOCKED`, except right after provisioning (see 6.1). |

### Grace period when ops is down

- After `validUntil` passes with no refresh, the product keeps working for a **grace period (proposed: 5 days)** on the last known snapshot, then shows the lock screen.
- The product also pulls `GET {ops}/api/products/{productKey}/snapshots/{businessId}` on a schedule (proposed: daily) as a backup to ops's pushes.
- A snapshot saying `LOCKED` takes effect at once. Grace only protects against *silence*, never against an explicit lock.

## 6. Commands: ops → product

All are `POST {product}/api/ops/commands`, body `{ "commandId", "type", "businessId", "payload" }`.

| Type | Payload | Product does |
|---|---|---|
| `business.provision` | name, owner email and name, plan snapshot | Creates the tenant with that `businessId`, stores the snapshot. Returns the tenant's local id and sign-in URL. |
| `snapshot.push` | the snapshot | Stores it if `version` is higher. |
| `business.suspend` / `business.reactivate` | reason | Sets the product-level suspended flag. Independent of billing status. |
| `notice.set` | title, message, button (path or https) | Shows the platform notice (replaces today's `PlatformNotice` row). |
| `business.delete` | typed confirmation (the business name), `retentionDays` (default 30) | Suspends the business now and really deletes it after the retention period. |
| `business.restore` | none | Cancels a pending delete during the retention period. |

Reads (GET, signed): `/api/ops/businesses?cursor=` (id, name, status, created, last active, counts), `/api/ops/businesses/{businessId}` (summary for the ops detail page), `/api/ops/health`.

### 6.1 Provisioning order

Ops creates the `Business` and `Subscription` first, then calls `business.provision` with the first snapshot in the same request, so the tenant never exists without one. If provisioning fails, ops retries the same `commandId`.

## 7. Events: product → ops

All are `POST {ops}/api/products/events`, body `{ "eventId", "type", "productKey", "businessId", "occurredAt", "data" }`. Minimal data only, never customer or payment-instrument details.

| Type | Data | Ops does |
|---|---|---|
| `business.signed_up` | owner name and email, business name, optional `backfill: true` | Creates the `Business` if new, a trial `Subscription`, pushes the first snapshot. Raises the "New caterer signed up" alert, except for a repeat, a second product joining, or a `backfill` (a business that existed before the product was linked to ops). |
| `business.updated` | the changed `businessName` and/or `ownerName` | Updates the directory entry. Sent when a business is renamed in onboarding or settings. |
| `usage.reported` | counts (customers, orders, events, users), period | Stores the latest counts for lists and limit warnings. Sent daily and on large changes. |
| `alert.raised` | severity, code, message | Creates a Super Admin alert (bell, push). |
| `owner.changed` | new owner email | Updates billing contact. |
| `message.requested` | template key, recipient role (`owner`), variables | Sends through ops's mail and WhatsApp (see 9). |

Self-serve signup stays in the product (its own sign-up page). The product tells ops, ops creates the business and subscription, then pushes the snapshot. Until the first snapshot arrives the product treats a just-signed-up tenant as `TRIALING` with the manifest's default trial entitlements, for at most a few minutes.

## 8. Subscriptions and billing (ops)

Decisions by AJ (2026-10-05):

- One **Subscription per Business + Product**. Separate invoice per product.
- A failed payment locks **only that product**.
- Bundles with discount: **later**. Do not build a Bundle entity yet.
- Same billing interval for all products now, but the interval is stored **on the Subscription**, so it can change later without a migration.
- Only Platterly's own money is collected here (Platterly's Razorpay). Kitchen money is out of scope.

Ops tables (new database; names are a proposal):

| Table | Holds |
|---|---|
| `product` | key, name, hosts, status, last manifest version and secrets reference |
| `business` | id, name, GST details, billing contact |
| `plan` | `productKey`, code, name, trial flag and days, prices per interval, GST percent, highlights, `entitlements` (JSON of key to value), active flag |
| `subscription` | business, product, plan, status, interval, trial end, period start and end, pending plan and interval, Razorpay ids |
| `subscription_payment` | per charge: amounts, GST split, Razorpay ids, invoice number, period, frozen invoice snapshot |
| `platform_billing_profile` | Platterly's seller details (moves unchanged) |
| `platform_notice` | notice text (moves unchanged) |
| `ops_user`, `ops_audit_log` | ops staff login and audit trail |
| `outbound_command`, `inbound_event` | delivery logs, retries, de-duplication |

Lifecycle:

| From | To | Cause |
|---|---|---|
| (new) | `TRIALING` | Signup |
| `TRIALING` | `ACTIVE` | First payment |
| `TRIALING` | `LOCKED` | Trial ended, no payment |
| `ACTIVE` | `PAST_DUE` | Renewal charge failed (retries run) |
| `PAST_DUE` | `ACTIVE` | A retry or manual payment succeeds |
| `PAST_DUE` | `LOCKED` | Retries exhausted or period end plus grace passed |
| `LOCKED` | `ACTIVE` | Payment succeeds on the subscribe page |
| any | `CANCELLED` | Owner cancels, or Super Admin cancels |

Every transition pushes a new snapshot (higher `version`). Downgrades chosen mid-period apply at the next payment, as today.

### 8.1 Checkout and the lock screen (revised by AJ, 2026-10-05)

The owner-facing billing screens **stay in the product** (catering's Settings → Subscription and `/subscribe`). Ops holds the data and the money; the product asks ops for it over a signed server-to-server **billing API** (product → ops, signed with the product's event secret, scoped to one `businessId` the product registered). Ops never shows its own pages to a kitchen owner.

| Product asks ops to | Ops does |
|---|---|
| List the plans on sale for this product | Returns each plan with price, GST, highlights, interval options |
| Show this business's subscription, payment history and invoices | Returns them (invoice data is the frozen snapshot, so the product can render the PDF with its own design) |
| Start checkout for a plan and interval | Creates the Razorpay order with Platterly's keys, writes a PENDING payment, returns the order id and public key id |
| Verify a checkout the owner just completed | Checks Razorpay's signature, confirms the payment once (also done by ops's own webhook), issues the invoice number, moves the subscription to `ACTIVE`, pushes a snapshot |
| Schedule or cancel a downgrade | Records it; it starts at the next payment |

1. The product shows the **lock screen** when the snapshot is locked (by status, by its own dates, or after the grace period).
2. Its plan chooser (the existing page) loads plans from ops and opens Razorpay Checkout with the order ops created.
3. When the owner pays, ops confirms (checkout verify or its webhook, whichever comes first), pushes the new snapshot, and the product lifts the lock.

Platterly's Razorpay keys and webhook (`/api/webhooks/razorpay-platform` today) move to ops. Each kitchen's own Razorpay and UPI stay in catering.

### 8.2 The snapshot decides time-based locks itself

A snapshot carries `trialEndsAt` and `currentPeriodEnd`. A product treats `TRIALING` with a passed `trialEndsAt`, or `ACTIVE` with a passed `currentPeriodEnd`, as locked on its own. This is today's `billingLockReason`, so a trial or paid period ends at the right minute even if ops is down. Ops's scheduled job still refreshes snapshots and writes the new status.

### 8.3 Cutover flag

Step 6 ships behind a flag (`OPS_BILLING`, off by default). Off means catering behaves exactly as before (plan rows). On means ops is the source of truth: a business with no snapshot yet gets the manifest's trial defaults for a short time, then is treated as missing. Step 8 removes the flag and the old code.

## 9. Messages from Platterly to the business owner

- Products never send these themselves. They emit `message.requested` with a template key and variables. Ops renders the template in that product's email design, sends via ZeptoMail (and WhatsApp when connected), and logs it.
- Ops itself sends billing messages (payment receipts, failed payment, trial ending) because it owns the facts.
- A business's messages to **its own customers** stay in the product with the business's own channels. Ops is never in that path.

## 10. Versioning and compatibility

- `X-Platterly-Contract: <n>` on every call. A product and ops each declare the range they support in the manifest and registry.
- Additive changes (new optional fields, new event types) do not bump the version. Receivers ignore unknown fields.
- A breaking change bumps the version and ops speaks both versions to each product until it upgrades.
- The shared contract package (types, signing, verification) is the only place these shapes are defined.

## 11. Mapping from today's catering schema

| Today (catering DB) | After |
|---|---|
| `SubscriptionPlan` (code, prices, GST, highlights, limits columns, `multiLocation`) | Ops `plan`. Limit columns become `entitlements` JSON: `maxUsers`, `maxEvents`, `maxOrders`, `maxKitchens`, `maxStores`, `maxCustomers`, `maxMenuLinks`, `maxStorageMb`, `maxReports`, `maxWhatsappMessages` (limits) and `multiLocation` (flag). |
| `Subscription` (history rows per organization) | Ops `subscription` (current) plus history. Catering keeps only the latest snapshot. |
| `SubscriptionPayment` and invoice numbers | Ops `subscription_payment`. Invoice numbers keep their format and continue the sequence. |
| `PlatformBillingProfile`, `PlatformNotice` | Ops, unchanged. |
| `limits.ts` (`assertWithinPlanLimit`, `hasMultiLocationPlan`) | Stays in catering, reads the snapshot instead of the plan tables. |
| `/super/*` pages | Ops app. Removed from catering last. |
| `Organization` | Gains `businessId` (external reference) and the snapshot. |

Existing data: every current `Organization` gets a `businessId`, and its current subscription and payment history are copied to ops. Invoice numbers must not restart or duplicate.

## 12. Order of work

| Step | What | Done when |
|---|---|---|
| 1 | This document approved | AJ signs off |
| 2 | Shared contract package (types, signing, verification) with tests. **Built: `packages/contract`, plain folder, 30 tests.** | Both sides import it |
| 3 | Ops app and ops DB with registry and business directory, no billing yet. **Built: `apps/ops`, `ops.localhost:3200`, DB `platterly_ops`.** | A product registers and ops lists its businesses |
| 4 | Catering admin API (manifest, commands, reads) and event emitter. **Built: `src/modules/ops-link`, `/api/ops/*`, outbox, `organization.businessId`.** | Ops shows live catering data without touching its DB |
| 5 | Snapshot in catering, `limits.ts` reads it, lock follows it (plan tables still the source). **Built: `src/modules/ops-link/entitlements.ts`.** | Behaviour unchanged, tests green |
| 6 | Move plans, subscriptions, payments and invoice numbering to ops (sub-steps 6a to 6e below) | Catering has no plan tables in use |
| 7 | Move Platterly's Razorpay checkout and webhook, GST invoices, platform messages and notice | Subscribe flow works through ops |
| 8 | Remove `/super` from catering, drop old tables | Ops is the only admin |

Each step ships on its own and is tested against a copy of the dev DB first. The old path keeps working until its replacement is verified.

## 13. Decisions on the open questions (AJ, 2026-10-05)

| # | Question | Decision |
|---|---|---|
| 1 | Grace period after `validUntil` | **5 days.** An explicit `LOCKED` snapshot still applies at once. |
| 2 | Same-server or public hostnames | **Same server now, separate servers possible later.** The registry stores one base URL per product and per direction. It is a setting, never assumed to be localhost, so moving a product to another server changes a registry value only. Calls on a separate server use HTTPS and the same signing. |
| 3 | Ops staff login | **Separate ops accounts**, not shared with product logins. |
| 4 | `business.delete` | **Ops-initiated only, with a typed confirmation, and a retention period** before the product really deletes. Length of the retention period is still to set (proposed: 30 days, during which the business is suspended and restorable). |
| 5 | Razorpay webhook for Platterly's own plans | **Moves to the ops host** (`ops.platterly.in/api/webhooks/razorpay`) at step 7. |

| 6 | Trial entitlements before the first snapshot | **The manifest's `trial` defaults** (`days` and `entitlements`). |
| 4b | Retention length | **30 days**, suspended and restorable (`business.restore`). |

| 7 | Dev address of the new ops app | **`ops.localhost:3200`.** The old `ops.localhost:3000` is not kept: it stops working at step 8 when `/super` leaves catering. Dev ports: catering 3000, site 3100, ops 3200. In production Nginx routes `ops.platterly.in` to the ops app. |

No open questions remain for v1.

## 14. What the catering side does today (step 4)

Switched on by four environment variables, all unset by default (then every `/api/ops/*` route answers 404 and nothing is sent):

| Variable | Meaning |
|---|---|
| `OPS_BASE_URL` | Where ops listens, for example `http://127.0.0.1:3200`. Events go to `<it>/api/products/events`. |
| `OPS_EVENT_SECRET` | Catering signs events and replies with it (ops shows it as "the product signs events with"). |
| `OPS_COMMAND_SECRETS` | Ops signs commands and reads with it. Comma separated, so the old and the new secret both work during a rotation. |
| `OPS_PRODUCT_KEY` | The key ops registered the product under. Default `catering`. |

- **Routes** (all signed, any host, so ops can use whatever address the server has): `GET /api/ops/manifest`, `GET /api/ops/health`, `GET /api/ops/businesses` (cursor paging, summaries only), `GET /api/ops/businesses/{businessId}` (summary and usage counts), `POST /api/ops/commands`.
- **Commands done:** `snapshot.push` (stored in `ops_snapshot`, only a higher version replaces it; not yet read by anything, step 5 does that), `business.suspend` and `business.reactivate` (map to the existing tenant status; a deactivated business answers 409 and is never lifted). A repeated `commandId` returns the stored answer and runs once.
- **Commands answered 501 `not_supported_yet`:** `business.provision`, `notice.set`, `business.delete`, `business.restore`. Provisioning and the notice come with billing (steps 6 and 7); deletion needs its own review because it removes a kitchen's data.
- **Events sent:** `business.signed_up` (at sign-up, and a catch-up with `backfill: true` for every business that existed before), `business.updated` (rename), `usage.reported` (once a day per business: customers, orders, events, users). A business with no known owner email is skipped until it has one.
- **Outbox:** events are written to `ops_outbox` first, sent at once on a best-effort basis, and retried by the scheduled job (`/api/cron/daily`, 1m, 5m, 30m, 2h, 12h, then given up). Each run sends at most 50, so a first catch-up of many businesses takes a few runs. Run the cron every minute or two.
- **Business id:** `organization.businessId` (`biz_` plus 32 hex), added by a default on the column, so every creation path gets one and existing businesses were filled in by the migration.
- **Not done yet:** a scheduled clean-up of old outbox and command rows (a new bulk delete needs AJ's approval under `docs/data-safety.md`), and an alert emitter.

## 15. How catering reads entitlements today (step 5)

Every plan limit, the multiple-locations flag and the lock now ask one place, `getEntitlements(organizationId)` in `src/modules/ops-link/entitlements.ts`. It has two sources, in this order:

| Order | Source | When |
|---|---|---|
| 1 | The snapshot ops pushed (`ops_snapshot`, found by `organizationId`) | The ops link is on and a valid snapshot exists |
| 2 | The kitchen's own Subscription and Plan rows, shaped the same way (`source: "plan"`) | Otherwise. This is what every kitchen uses until ops issues snapshots (step 6), so behaviour is unchanged. |

- **Callers moved:** `assertWithinPlanLimit` and the multiple-locations checks (`limits.ts`), the team seat limit (`getSeatUsage`), the lock redirect to `/subscribe` (`requireActiveOrganization`), the public API's `ACCOUNT_LOCKED`, and the public storefront and sitemap (`getPublishedTenantBySlug`, `listPublishedTenantSlugs`, which use one snapshot query for all kitchens).
- **Not moved (display only, billing screens):** the Settings subscription page, `/subscribe`, invoices, the sidebar trial card and the Super Admin plan views still read the plan rows. They move with billing in steps 6 and 7.
- **Derived status:** an ended trial or paid period is `LOCKED`, a cancelled or expired plan is `CANCELLED`, a running trial is `TRIALING`, anything else `ACTIVE`. A kitchen with no subscription stays open (as before) without the multiple-locations flag.
- **Grace:** a snapshot past `validUntil` keeps working for 5 days (`stale`), then locks. An explicit `LOCKED` or `CANCELLED` applies at once.
- **A damaged stored snapshot is ignored** (and logged), so a bad push can never lock every kitchen by accident.
- **Purge:** `OpsSnapshot` is exempt from "Delete All Data" (it is the kitchen's standing with Platterly, not its data).
- **Not tested end to end:** a snapshot lock through a real browser session. The lock decision itself is covered by unit tests, and the existing Playwright suite covers the lock redirect from plan rows.

## 16. Step 6 sub-steps

| # | What | Done when |
|---|---|---|
| 6a | Date rules inside the snapshot, ops cron, ops-to-product command outbox with retries. **Built.** | Contract and ops tests pass |
| 6b | Ops plans, subscriptions, staff screens, snapshot issuance and pull; catering's daily pull and the `OPS_BILLING` flag. **Built** (the billing profile moves in 6d with invoices). | A plan change in ops changes a kitchen's limits |
| 6c | One-time import from catering, with dry run and reconciliation. **Built and applied to the dev data** (`npm run ops:import-catering`). | Rehearsed, reconciled, catering unchanged |
| 6d | Ops billing API (section 8.1), Razorpay checkout, webhook, invoice numbering and snapshots. **Built.** | Tested with mocked Razorpay (platform keys are not set yet) |
| 6e | Catering cutover behind `OPS_BILLING`: Settings, `/subscribe`, sign-up trial, `/super` plan screens point to ops. **Built; the flag is off.** | Full suite green with the flag on and off |

AJ's answers (2026-10-05): only dev and test data exists; the 24 dev businesses with no owner email stay on their plan rows and get no ops subscription.

## 17. What exists after 6a and 6b

**Ops (`apps/ops`)**

| Piece | Behaviour |
|---|---|
| Plans (`/plans`) | Per product. Entitlements are validated against the product's manifest, so an unknown key or a wrong type is refused. Saving a plan sends a fresh snapshot to every business on it. A retired plan cannot be assigned. |
| Subscriptions (business page) | Assigning a plan ends the current subscription and starts a new one in one transaction; history is kept; the database allows only one current row per business and product. A trial plan starts `TRIALING` with its end date; a plan assigned by hand starts `ACTIVE` with no period end, so it never locks by itself (as before). |
| Trial at sign-up | A brand-new business (not a backfill) starts on the product's active trial plan and gets its first snapshot. No trial plan configured: nothing is created. |
| Snapshot issuance | Version per business and product (`business_product.snapshotVersion`), only ever rising. Sent as a `snapshot.push` command through the outbox. Refreshed daily by the cron. A product can also pull it: `GET /api/products/{key}/snapshots/{businessId}` (signed by the product, reply signed by ops; 404 for a business the product did not register). |
| Command outbox | Commands are written first, sent at once, retried by the cron (1m, 5m, 30m, 2h, 12h). The reply must be signed by the product to count. 501 and other 4xx fail at once. |
| Cron `/api/cron` (`CRON_SECRET`) | Marks ended trials and paid periods `LOCKED`, refreshes old snapshots, sends due commands. Call it every minute or two. |

**Catering**

- Pulls any snapshot that is missing or older than a day, once a day, from the scheduled job (`ops_pull` remembers a 404 so it is not asked every minute).
- `OPS_BILLING=1` makes a stored ops snapshot decide limits and the lock. Off (the default), catering reads its own plan rows exactly as before, however many snapshots it has stored. Ops and catering therefore cannot disagree in a way kitchens can feel until the flag is turned on in 6e.

## 18. The catering import (6c)

`npm run ops:import-catering` in `apps/ops`: dry run by default, `-- --apply` commits. Source: the catering database (`CATERING_DATABASE_URL`, else `DATABASE_URL` in the repo root `.env`); target: the ops database.

- **Catering is only read.** The source connection is a read-only transaction, so the database itself refuses any write; the invoice sequence is read with `SELECT` (never `nextval`), so catering's numbering is not advanced. A test proves both, and the live apply was checked by fingerprinting catering's plan, subscription, payment, billing-profile and organization rows and its invoice sequence before and after: identical.
- **What moves:** every plan (limit columns become the entitlement JSON), every subscription row (history kept) for businesses ops already knows, every PAID plan payment with its frozen invoice snapshot, and the billing profile. Abandoned or failed checkouts (PENDING, FAILED) are not carried over. Businesses ops does not know (no owner email) stay in catering only.
- **Safe to repeat.** Every row has an id derived from its catering id and is inserted only if missing, so a second run changes nothing and never overwrites what staff edited in ops. A business that already has any subscription in ops is left alone, and so is a plan or billing profile ops already has.
- **Checked before anything is kept.** The import runs inside one transaction and then reconciles: each plan and subscription is compared field by field, money is summed both ways (total, GST, amount before GST), invoice numbers are compared as sets, and there must be at most one current subscription per business. Any difference rolls everything back. Inconsistent source data (a paid payment with no invoice number, amount plus GST not equal to the total, a missing plan, a limit the manifest does not declare) stops the import before it writes.
- **Invoice numbers never repeat.** After the commit, ops's `subscription_invoice_seq` is raised to catering's current value, and it never moves backwards.
- **Dev run (2026-10-05):** 3 plans, 28 subscriptions (27 businesses), 0 payments, the billing profile; invoice sequence 263. 24 businesses without an owner email were left out.

**Test isolation lesson.** The ops tests share the dev database, and once real data was imported a global scheduled run in a test (sweep, snapshot refresh, command delivery) locked real trials and pushed 27 snapshots to the live catering app. Fixed: those jobs, and the cron (`?product=<key>`), now accept a product key, every test passes its own, and a check after the suite showed ops and catering unchanged. Catering's 27 stray `ops_snapshot` and `ops_command` rows from that run were removed and its fingerprint matched the before state again.

## 19. The billing API and payments in ops (6d)

Platterly's own Razorpay keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) now live in the ops environment; unset means checkout answers "not switched on yet". A kitchen's own Razorpay and UPI stay in catering. Catering's code was not changed in 6d.

**Routes a product calls** (all under `/api/products/{productKey}/`, signed by that product, answers signed by ops, the business must be one the product registered, otherwise 404):

| Route | Does |
|---|---|
| `GET billing/plans` | Plans on sale for the product, GST worked out |
| `GET businesses/{id}/billing` | Current subscription, history, paid payments, whether online payment is on |
| `POST businesses/{id}/billing/checkout` | `{planId, interval, buyer}`: creates the Razorpay order (total with GST, in paise) and a PENDING payment that remembers the buyer's name, address and GSTIN |
| `POST businesses/{id}/billing/verify` | Checks Razorpay Checkout's signature and confirms the payment once |
| `POST` / `DELETE businesses/{id}/billing/downgrade` | Schedules or cancels a lower plan that starts at the next payment |
| `GET businesses/{id}/billing/payments/{paymentId}` | The frozen invoice (numbers, GST split, seller and buyer as they were), so the product prints it with its own design |

**Razorpay webhook:** `POST /api/webhooks/razorpay` on the ops host (events `payment.captured`, `payment.failed`). Any failure to verify answers the same 401; a valid event is always answered 200 so Razorpay stops retrying; a captured amount that is not the order's total is ignored.

**Confirming a payment** (checkout verify or webhook, whichever is first; the other changes nothing):
- one payment is one period (30 days or 365) and exactly one invoice, even under concurrent calls;
- renewing the same plan early adds on top of what is left; a different plan, or a lapsed business, starts today and ends the old subscription (history kept); a scheduled downgrade is cleared by renewing;
- the invoice number is `<prefix><initials>-<yy>-<mm>-<n>` from the shared sequence, which continues from catering's 263, never repeats;
- GST: same state as Platterly is CGST + SGST, another state IGST, unknown a single GST line; the seller, buyer and GST split are frozen into the payment;
- a fresh snapshot goes to the product afterwards; if that fails the payment still stands and the cron retries.

**Staff screens:** `/billing` (seller details, invoice prefix and note, Razorpay status, payments received, a preview of the next invoice number) and `/payments/{id}` (the frozen invoice).

**Form behaviour:** React clears uncontrolled form fields after a form action even when it only reports a validation error. The ops forms use `useFormAction`, which keeps what was typed.

## 20. The cutover, behind `OPS_BILLING` (6e)

With `OPS_BILLING` off (the default, and how the dev server runs today) catering behaves exactly as before. With it on (and the ops link configured), ops is the source of truth:

| Screen or path | With the flag on |
|---|---|
| Lock screen and plan chooser (`/subscribe`) | Plans, prices and the current subscription come from ops; checkout, verify and downgrade go through the billing API. If ops cannot be reached the page says billing is unavailable instead of showing stale plans. The lock itself still follows the snapshot, so ops being down never locks anyone out early. |
| Settings → Subscription | Same page, filled from ops. Plan limits come from the snapshot. History rows lose their per-row PDF (that PDF is made from a catering row); real payments, with their invoices, are listed under Payments. |
| Plan invoice PDF | Same layout, printed from ops's frozen invoice. |
| After paying | Catering verifies with ops, then pulls the new snapshot at once, so the lock lifts immediately. |
| Sign-up | No local trial subscription. Ops starts the trial when it hears of the sign-up and sends the snapshot. Until it arrives the kitchen runs on the manifest's trial defaults for 24 hours (then it counts as missing and locks). |
| A kitchen with no snapshot but its own subscription rows | Stays on those rows (ops has not issued for it yet). |
| Sidebar trial card | Follows the snapshot's trial dates. |
| Super Admin: plans, assigning a plan, billing details | Shows "managed in Platterly Ops now"; the actions themselves refuse (`guardNotManagedByOps`), so the two copies can never disagree. |

**To switch on** (a checklist, in this order): back up catering's database; in `apps/ops` run `npm run ops:import-catering` (dry run) then `-- --apply` again right before the cutover (it picks up plans, subscriptions and payments made since, and raises ops's invoice sequence to catering's current value, which matters because catering's own invoices keep using the shared numbers until then); set `RAZORPAY_*` in ops and register `/api/webhooks/razorpay` there; set `OPS_BILLING=1` for catering and restart it; check a sign-up, `/subscribe` and Settings → Subscription. **To roll back:** unset `OPS_BILLING` and restart; catering reads its own rows again (anything paid through ops meanwhile must be re-imported or recorded by hand).

**Known gaps until step 8** (when the old code and tables go): the Super Admin dashboards and the Subscriptions analytics still read catering's own plan rows, so they go stale once the flag is on; plan-change notification emails to owners are not sent (messaging moves to ops in step 7); history-row PDFs as above.

**Verified live (2026-10-05, throwaway kitchen):** with the flag on, a new kitchen signed up, ops started its trial and pushed the snapshot, Settings → Subscription showed the trial from ops (7 days, unlimited limits), `/subscribe` showed ops's Premium plan at ₹3,000 + 18% GST with "Online payment is not switched on yet" (no Razorpay keys), and the Super Admin plan and billing screens showed the managed-in-Ops banner. The throwaway kitchen and its ops records were removed.
