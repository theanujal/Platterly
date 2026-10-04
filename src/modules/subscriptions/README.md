# subscriptions

Owning chunk: Chunk 3 Group 3.3 (plan definitions, manual assignment) / Chunk 20 (live Razorpay billing).

Domain logic (framework-agnostic — no auth checks inside; callers under `src/app/super/(admin)/plans/` and `tenants/[id]` guard with `requireSuperAdmin()` first):

- `plan.ts` — `SubscriptionPlan` catalog CRUD (`createPlan`/`updatePlan`/`listPlans`/`getPlan`/`deactivatePlan`). Platform-wide, not tenant-scoped. Never hard-deleted.
- `trial-plan.ts` — `ensureTrialPlan()`, an idempotent upsert (keyed on `code: "trial"`) rather than a migration/CI seed step. **Any chunk that needs the Trial plan to exist (Chunk 4's onboarding wizard included) must call `ensureTrialPlan()` itself before reading it** — nothing guarantees the row exists on a fresh checkout otherwise.
- `subscription.ts` — `assignPlan`/`getCurrentSubscription`/`listSubscriptionHistory`. `assignPlan` ends the tenant's current subscription and starts a new one in one transaction; history rows are never deleted (immutable per the updated product doc §19).

Chunk 20 (live billing):

- `billing-math.ts` — pure: `priceBreakdown` (plan price + GST), `periodEndFrom` (monthly = 30 days, annual = 365), `annualSaving`, `billingLockReason`.
- `billing.ts` — `startSubscriptionCheckout` / `verifySubscriptionCheckout` / `confirmSubscriptionPayment` (idempotent; webhook and checkout can both call it), `scheduleDowngrade` (a lower plan starts at the next payment), `listSellablePlans`, `getBillingState`. Uses **Platterly's own** Razorpay keys from `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` (webhook: `/api/webhooks/razorpay-platform`), unlike Chunk 14 which uses each kitchen's keys. Unset keys = checkout answers "not switched on yet".
- `limits.ts` — `assertWithinPlanLimit` (customers, orders, events; team seats are checked in `getSeatUsage`).
- **Lock rule:** an ended trial, an ended paid period, or an EXPIRED/CANCELLED current subscription locks the kitchen. `requireActiveOrganization()` redirects it to `/subscribe` (pass `allowLocked: true` only on that page and its actions). A plan the Super Admin assigned by hand has no period end and never locks. The public storefront and sitemap also drop a locked kitchen.
- Prices are before GST; the plan's `gstPercent` and `highlights` (the benefit bullets) are set by the Super Admin on the plan form.
