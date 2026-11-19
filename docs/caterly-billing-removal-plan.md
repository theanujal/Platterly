# Plan: remove Caterly's own billing code (billing, plans and subscriptions managed centrally)

Written 2026-11-18 for AJ and Sharath. **Draft, nothing built.** AJ agreed on 2026-11-15 that this is its own planned task and that a plan comes first; this is that plan. It needs AJ's approval before any phase starts.

## Why

Plans, subscriptions, payments, invoices, refunds and the sidebar notice are owned by Platterly Ops and shown in the Platterly Store and Account. Caterly still carries its own older copy of that code and runs it only when `OPS_BILLING` is off. After go-live that copy is dead weight: it can drift from Ops and it keeps a second set of money tables alive.

## What is NOT removed (still used with `OPS_BILLING=1`)

| Keep | Why |
|---|---|
| `Settings, Subscription` page and its invoice and credit-note downloads | The read-only view AJ approved (2026-11-15); reads Ops data |
| `src/lib/billing-door.ts` (`/subscribe` sends the Business Admin to the Store) | Old emails, notices and bookmarks still arrive there |
| `ops-link/*` (entitlements, snapshot pull, commands, events, plan-billing) | This is the central link |
| `subscriptions/limits.ts`, `usage.ts`, `platform-notice.ts` (Ops notice part) | Limits and the notice come from the Ops snapshot through `getEntitlements` |
| `subscriptions/billing-math.ts`, `plan-invoice-pdf.ts`, the `TRIAL_DURATION_DAYS` constant | Used by entitlements (lock reasons) and the stand invoice; may move into `ops-link/` |
| Tables `OpsSnapshot`, `OpsNotice` | The central data Caterly reads |

## What goes

| Remove | Where | Used by today |
|---|---|---|
| Razorpay webhook for Platterly's own account | `src/app/api/webhooks/razorpay-platform/route.ts`; env `RAZORPAY_WEBHOOK_SECRET` (and the key pair if nothing else uses them; the per-kitchen route `webhooks/razorpay` stays) | Nothing once the webhook points at Ops |
| Local checkout and payment code | `subscriptions/billing.ts`, `gst-split.ts`, `invoice-number.ts`, `invoice-snapshot.ts` | Only the webhook and tests |
| Local plan management | `subscriptions/plan.ts`, `platform-billing.ts` | Only tests (no screen calls them any more) |
| The off mode (flag-off branches) | `app/(app)/layout.tsx`, `notifications/triggers.ts` (local trial and plan emails), `platform-link/pending.ts` and `tenants/auto-provision.ts` (local trial row), `ops-link/entitlements.ts` (`viewFromPlan`, plan-row fallback), `ops-link/events.ts`, `ops-link/manifest.ts` (`billing: "product"`), `ops-link/plan-billing.ts` (`state: "off"`), `ops-link/guard.ts`, `ops-link/config.ts` (`opsBillingOn`) | Only when the flag is off |
| Local trial plan | `subscriptions/trial-plan.ts` `ensureTrialPlan`, `subscriptions/subscription.ts` `assignPlan` | Provisioning when the flag is off |
| Tables | `Subscription`, `SubscriptionPlan`, `SubscriptionPayment`, `PlatformBillingProfile` | Nothing after the code above is gone |
| Tests | `subscriptions/__tests__/{billing,plan,invoice,yearly-renewal,subscription}.test.ts`, off-mode cases in `ops-link/__tests__/{cutover,entitlements,plan-billing,pull,ops-link}.test.ts`, `triggers.test.ts`, stand and locations tests that seed plan rows; Playwright helpers in `e2e/db.ts` that write plan rows (`activatePaidPlan`, `givePlanWithMultiLocation`, `setPlatformNotice` and friends become snapshot-only), specs `paid-signup`, `plan-billing-view`, `single-signup`, `kitchenlogin` | |

Also: `OPS_BILLING` leaves `.env.example`, `deploy/env/catering.env.example`, `docs/ops-cutover.md` and `docs/go-live-order.md`.

## Gate: when removal may start (all must be true)

1. The go-live cutover has run in production: `docs/ops-cutover.md` steps 10 to 14 done, import applied, every reconciliation line OK.
2. Every row of the go-live comparison (`npm --prefix apps/ops run ops:compare-catering`) has a recorded decision (keep catering or keep Ops) and the import was run after those decisions.
3. At least one full paid monthly cycle has run through Ops (real renewal charge, webhook, invoice, receipt email). **AJ, 2026-11-19: no wait.** Everything is tested locally first; once go-live is done the old billing code is removed immediately. The real-renewal proof is replaced by the go-live test checklist (to be written).
4. A backup of the Caterly database exists (`pg_dump`, kept).
5. Until then the rollback is "unset `OPS_BILLING` and restart". Removal deletes that rollback, so it must not happen earlier.

## Phases (each its own commit, none in the same release as the cutover)

| Phase | What | Proof |
|---|---|---|
| R1 | Remove the `razorpay-platform` webhook, `billing.ts`, `gst-split`, `invoice-number`, `invoice-snapshot`, `plan.ts`, `platform-billing` and their tests; drop the Platterly Razorpay env vars from Caterly | Typecheck, Caterly unit tests, one live spec: paid sign-up (`paid-signup.spec.ts`) |
| R2 | Remove the off mode: make Ops mandatory in provisioning, entitlements, notices and layout; delete `opsBillingOn` and the flag; keep the fail-safe for "no snapshot yet" (24 hour window) and "Ops unreachable" (stale snapshot rules stay) | Unit tests for entitlements; `navigation`, `kitchenlogin`, `single-signup`, `plan-billing-view` run one at a time |
| R3 | Test and helper clean-up: `e2e/db.ts` snapshot-only, delete plan-row seeding | The four specs above plus `locations`; `npm run lint`, `npm run typecheck` |
| R4 | **Destructive migration** dropping the five tables. Needs `-- data-safe-approved:` (`npm run check:migrations`), a fresh backup, and AJ's written approval. Ships alone, in a later release than R1 to R3. | Dry run of the migration on a copy of the production data |
| R5 | Docs: this plan marked done, `ops-cutover.md` "Rolling back" and "Not part of the cutover" rewritten, STATUS and handover | Read-through |

## Risks

| Risk | Handling |
|---|---|
| A kitchen with no snapshot yet (new sign-up while Ops is down) | Keep the 24 hour trial window and the lock rules from `entitlements.ts`; test them in R2 |
| Local development always needs Ops running | After R2 Caterly cannot run billing screens without Ops. Acceptable? (open question 2) |
| Dropping tables loses history Ops does not hold | R4 only after the comparison and import show Ops has every row; backup kept |
| A hidden user of the removed code | Typecheck and `git grep` per phase; the list above comes from a grep of 2026-11-18, repeat it at the start of each phase |

## Decisions (AJ, 2026-11-19)

| # | Question | Answer |
|---|---|---|
| 2 | After removal, local Caterly cannot show plans or limits unless Ops is running. Fine? | **Yes.** Note: this is only about local development and billing screens. In production, if Ops stops, Account, sign-in and sign-up (Platform) keep working and Caterly keeps working from the last snapshot it received: a paid or trial kitchen is allowed until its `validUntil`, then for the grace days more (`packages/contract/src/snapshot.ts`). What stops is buying, plan changes, refunds, notices, and a brand-new sign-up only has the 24 hour window before it locks. A local developer needs Ops running or a seeded snapshot row (the e2e helpers seed one). |
| 4 | R1 to R3 as one pull request, R4 as a second, later one? | **Yes.** |
| 1 | Wait before R1 | **No wait (AJ, 2026-11-19).** Everything is tested locally first; the old billing code is removed right after go-live. The 4-week wait is dropped. |
| 3 | Keep or drop the legacy `PlatformNotice` table | **AJ, 2026-11-19: keep it, AJ needs the platform notice.** It is the old single Super Admin row for the sidebar box (enabled, title, message, button label and URL); `OpsNotice` replaced it per business. Local has one row, switched off. Do not drop it in R4; it stays out of the removal list. |

## Go-live data check (separate, done before the switch)

`npm --prefix apps/ops run ops:compare-catering` prints every Caterly business beside its Ops row with a verdict (SAME, DIFFERENT, NOT IN OPS) and an empty column for AJ's decision. It is read-only. On local data (2026-11-18): 9 businesses, 2 DIFFERENT (Platterly Demo Kitchen; Bhandarys Kitchen, who is a paid client currently on a trial while he evaluates the platform, so Ops's trial row is the true state today), 7 NOT IN OPS (test rows).
