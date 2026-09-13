# subscriptions

Owning chunk: Chunk 3 Group 3.3 (plan definitions, manual assignment) / Chunk 20 (live Razorpay billing).

Domain logic (framework-agnostic — no auth checks inside; callers under `src/app/super/(admin)/plans/` and `tenants/[id]` guard with `requireSuperAdmin()` first):

- `plan.ts` — `SubscriptionPlan` catalog CRUD (`createPlan`/`updatePlan`/`listPlans`/`getPlan`/`deactivatePlan`). Platform-wide, not tenant-scoped. Never hard-deleted.
- `trial-plan.ts` — `ensureTrialPlan()`, an idempotent upsert (keyed on `code: "trial"`) rather than a migration/CI seed step. **Any chunk that needs the Trial plan to exist (Chunk 4's onboarding wizard included) must call `ensureTrialPlan()` itself before reading it** — nothing guarantees the row exists on a fresh checkout otherwise.
- `subscription.ts` — `assignPlan`/`getCurrentSubscription`/`listSubscriptionHistory`. `assignPlan` ends the tenant's current subscription and starts a new one in one transaction; history rows are never deleted (immutable per the updated product doc §19).
