# Caterly's read-only Subscription page (plan)

Date: 2026-11-15. Status: PLAN, nothing built. Decision by AJ, 2026-11-15.

## Decision

| # | Decision | Source |
|---|---|---|
| 1 | Caterly gets a Subscription page back, **read-only**. The data comes from the Platterly side (Ops, the same records the Account shows). | AJ, 2026-11-15 |
| 2 | Who may open it is decided by **Caterly's own team and roles**: a new permission the owner can give to any role. The Platform does not learn product roles. | AJ, 2026-11-15 |
| 3 | Buying, renewing, refund requests, auto-pay and cancel stay in the Account and Store, **Business Admin only** (unchanged). | Gate C record, 2026-11-14 |
| 4 | The Old Admin sees no finance (unchanged). | AJ, 2026-11-13 |

This replaces the earlier idea of Caterly telling the Platform who holds billing access (F12.1.2 design question). It also partly reverses "Caterly has no billing pages" (2026-11-14): the page returns, but only to look at.

## What the page shows

Per the running subscription: plan, status ("Payment due", "Locked" and so on, worked out the same way as the Store), what the plan costs for its billing interval (GST included) and what it includes, auto-renewal state and next billing date; then the subscription history; then every payment with its invoice PDF, its refund state and any credit notes (PDF). No buttons that change anything.

- The **Business Admin** (owner, `tenant:edit`) also sees "Manage in your Platterly Account", which opens the Store.
- Anyone else with the permission sees no action, only a line: "Plan changes and payments are made by your Business Admin."
- A kitchen that is **locked** keeps the page open for people with the permission, so they can see why. Only the Admin sees Renew (as the locked screen does now).
- With `OPS_BILLING` off: the page says billing is managed in Platterly. Nothing is shown from Caterly's own rows.

## Where the data comes from

Caterly already has a signed client to Ops (`src/modules/ops-link/billing-client.ts`, the product's own secret). Ops already answers it:

- `GET /api/products/{product}/businesses/{business}/billing`: subscription, history, payments (now also carrying refund state and credit notes, since the Account work shares the same view).
- `GET .../billing/plans`: the plans with prices and highlights (for price and "what it includes").
- `GET .../billing/payments/{paymentId}`: the frozen invoice, which Caterly renders with the shared invoice PDF code.

Only one Ops addition is needed: **a product read for a credit note** (`.../billing/refunds/{refundId}/credit-note`, scoped to the business and product, signed like the others). Additive, with its own tests.

The Platform is not involved. It would only be a middleman for the same Ops data.

## The permission

A new key in Caterly's `sensitive` group: **`planBilling`**, shown to owners as **"Billing and Plan"** (see the Platterly subscription, invoices and payments). Owner has it. No other built-in role has it by default; the owner can turn it on for any role in Manage Role Permissions. The Old Admin role never has it. Work in the same places as the other sensitive keys: `permissions.ts`, `role-matrix.ts`, `role-permissions.ts`, `role-editor.ts`, `sensitive-access.tsx`, and their tests.

## Slices (each ends with unit tests and one surgical Playwright spec, then a status table)

| Slice | What | Where |
|---|---|---|
| V1 | Ops: product credit-note read (route, `proxy.ts` entry, tests) | Ops |
| V2 | Caterly: `planBilling` permission, role editor and matrix, tests | Caterly |
| V3 | Caterly: `/settings/subscription` page (read-only), small data layer on `opsBilling`, invoice and credit-note download routes, Settings menu entry for people with the permission | Caterly |
| V4 | Playwright (throwaway DBs): owner sees the page and the Manage button; a role given `planBilling` sees it without the button and can download an invoice; a role without it is refused; the Old Admin is refused; locked kitchen keeps the page for a permitted person | Caterly + Ops |

`/subscribe` and the old links keep working as they do now (the billing door); `/settings/subscription` stops redirecting and becomes the page.

## Not changed

- The Account's Subscriptions page and everything the Admin does there.
- Caterly's own billing code behind `OPS_BILLING` off: still waiting for its separate removal plan.

## Settled points

Both settled by AJ, 2026-11-15: the permission is called **"Billing and Plan"**, and the `accounts` (finance) team role has it **off** by default (the owner turns it on).
