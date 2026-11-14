# Gate C decision record (F12.1.0)

Recorded 2026-11-14 on AJ's word, in chat. Closes Gate C of `docs/platform-foundation-plan.md` (section 7, Gate C: D9, D12, billing-rights confirmation, `PAST_DUE` wording). Docs only: no code changed by this record.

| # | Decision | Outcome | Who decided |
|---|---|---|---|
| D9 | Coupon rules (F12.3) | **Percent and fixed-amount coupons. One coupon per order, no stacking.** | AJ, 2026-11-14 |
| D12 | When M2 starts | Already settled: after M1 L3 approval, local only. M2 work is under way locally. Nothing further to decide. | Plan, 2026-11-04 |
| F12.1.2 | Billing rights | **Only the Business Admin buys.** The Business Admin, and any other role the product has given billing access (manager, finance team or any other role), can view and download invoices and payments. They cannot buy. | AJ, 2026-11-14 |
| F12.2.2 | `PAST_DUE` wording | **Customers read "Payment due".** Derived from the dates, never stored. See below. | AJ, 2026-11-14 (proposal approved) |

## Billing rights: how it will be built

- The Platform knows only two central roles, `admin` and `former_admin`. Manager, finance and similar roles live inside each product, because products own their teams (AJ, 2026-11-10).
- So "other roles can see invoices" means the Platform learns which product members hold billing access. Source: the membership events a product already sends to the Platform. The exact shape is designed in F12.1.2, not here.
- Buying stays Admin-only in every case. The Old Admin (`former_admin`) sees no prices or finance (AJ, 2026-11-13) and so sees no invoices.

## `PAST_DUE`

- Ops never sets the `PAST_DUE` status. It stays in the list of statuses, unused. Ops staff screens may still say "past due".
- The Store works "Payment due" out from the dates, using the same 7-day paid grace the products lock by (`paymentGraceEnd` in `packages/contract`), so the Store and Caterly cannot disagree. Code: `apps/platform/src/modules/store/status.ts`.

| State | Label | Text |
|---|---|---|
| Paid days ended, inside the 7 days | Payment due | "Your paid days ended on {date}. You keep full access until {date + 7 days}; pay before then to keep your plan." |
| Grace over | Locked | "Your plan ended on {date} and the 7 days to renew have passed. Choose a plan to restore access." |
| Renewal stopped, period not over | Ending | "You stopped renewal. Your plan stays active until {date}." |
| Auto-pay renewal failed (added with refunds and payment-method update, F12.4.2) | Payment due | "Your last payment did not go through. Update your payment method or pay again to keep your plan." Whether this needs its own state is decided when F12.4.2 is built. |

## What this unblocks

| Step | Needs |
|---|---|
| F12.3 coupons | D9 (closed) |
| F12.1.2 billing rights, F13 Account pages | Billing-rights rule (closed) |
| F12.4.2 refunds and payment-method update | The failed-renewal line (agreed) |
