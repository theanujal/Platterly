# Legacy development records: Menu Approvals + Orders merge (Decision 4)

**Read-only report. Nothing was changed.** No record was modified, deleted, repaired or migrated, and no cleanup is approved. AJ reviews this and approves any action separately.

- Query: `scripts/report-approval-order-mismatch.sql` (starts with `SET default_transaction_read_only = on`; selects only). Run with `psql "${DATABASE_URL%%\?*}" -v ON_ERROR_STOP=1 -f scripts/report-approval-order-mismatch.sql`.
- Database: the development database (`platterly_dev`). Production has no data yet.
- Rule used: the SQL form of `orderStatusForSelection` / `deriveOrderStatus` in `src/modules/orders/order-status.ts` (the least-advanced live selection decides; Cancelled only when every selection is).
- Result: 27 rows, matching the audit: **8 MISMATCH + 19 NO_SELECTION**.

## A. Order status does not match the menu selection (8)

All eight are in business `2580ceec-…` and were created on 2026-09-17 or 2026-09-18, before the status rules of 2026-09-26 and 2026-09-30 (the derived Order status and the hand-made status override). That is a likely cause, not a verified one.

| Order | Order id | Order status now | What its menu selection implies | Menu status / kitchen stage | Event ends |
|---|---|---|---|---|---|
| ORD-0003 | `cmu5weujs000u7ihee7e0on9l` | Sent to Kitchen | Awaiting Customer Approval | CUSTOMER_REVIEWING / PENDING | 2026-09-20 |
| ORD-0004 | `cmu6v1ia200ch7iheghvlrhl9` | Pending Review | Awaiting Customer Approval | CUSTOMER_REVIEWING / PENDING | 2026-09-18 |
| ORD-0006 | `cmu749i4y000pjehezwmcoa4f` | Pending Review | Sent to Kitchen | FINAL_LOCKED / IN_PREPARATION | 2026-10-01 |
| ORD-0008 | `cmu749i6s001rjeheeem6qaeh` | Pending Review | Sent to Kitchen | FINAL_LOCKED / READY | 2026-09-17 |
| ORD-0009 | `cmu749i7l002cjehejth6z9wv` | Pending Review | Completed | FINAL_LOCKED / DELIVERED | 2026-09-16 |
| ORD-0010 | `cmu749i87002zjehecvx0a6c3` | Pending Review | Completed | FINAL_LOCKED / DELIVERED | 2026-09-13 |
| ORD-0011 | `cmu749i8o003kjehee1zvpize` | Pending Review | Approved | CUSTOMER_APPROVED / PENDING | 2026-09-22 |
| ORD-0013 | `cmu7fzmll006bdcheqe10h1yp` | Pending Review | Approved | CUSTOMER_APPROVED / PENDING | 2026-09-26 |

Observations:

- Seven of the eight show an Order status **behind** the approval; ORD-0003 is **ahead** of it (Sent to Kitchen while the customer is still reviewing), so re-syncing it would move the order backwards.
- All eight have event end dates before today (2026-09-13 to 2026-10-01), so the Orders list already hides them ("upcoming only" rule); they would appear in the Past view (Decision 2).

Recommended handling (for AJ to choose; none applied):

| Option | What it does | Effect | Risk |
|---|---|---|---|
| A. Re-sync through the app | Call the existing `syncOrderStatus` for each of the eight, so Order status follows the menu again and an AUTOMATIC history row is recorded | Keeps the records and their history; fixes the contradiction using the same code every real order uses | Moves ORD-0003 backwards; ORD-0009/0010 become Completed, and Completed locks the order (`isOrderLocked`); status-change side effects such as stock put-back apply only to Cancelled, which none of these are |
| B. Leave as they are | No change | The new views show contradicting statuses for these eight | None to data; confusing in demos |
| C. Delete the eight dev orders | Removes them and what hangs off them | Cleanest list | Destructive, hard to reverse; needs explicit approval per rule 4 |

Recommendation: **A** after AJ reviews the list, with the work done as a script that prints what it will change first and applies it only on a second approval. Not started.

## B. Orders with no menu selection (19)

Eighteen are in business `ca245878-…` (order numbers `MK-…` and `ORD-2026…`, which look like test fixtures; not verified), one in `2580ceec-…`. All were created between 2026-03-06 and 2026-10-10.

| Group | Count | Orders |
|---|---|---|
| Has an Event Type and an Event, but no menu selection | 18 | `MK-181550B7` (Completed), `MK-EC00A58F` (Cancelled), `MK-51BDEDD4`, `ORD-20260619-094017-081`, `ORD-20260622-084512-345`, `ORD-20260625-123251-548`, `ORD-20260709-151114-136`, `ORD-20260713-162128-997`, `ORD-20260802-081141-280`, `ORD-20260804-124135-311`, `ORD-20260812-060149-898`, `ORD-20260812-072323-635` (Awaiting Customer Approval), `ORD-20260812-111209-915`, `ORD-20260907-125741-032`, `ORD-20260910-110138-403`, `ORD-20260916-104046-470`, `ORD-20260916-105438-992`, `ORD-20261010-052148-019` (all others Pending Review) |
| Has an Event Type but no Event | 1 | `cmu1nw7g2004nhrhevszf93g9` (no order number; business `2580ceec-…`; created 2026-09-14) |

Notes: the full ids are in the query output. The two `MK-` orders sit at Completed and Cancelled with no selection, and `ORD-20260812-072323-635` is Awaiting Customer Approval with no selection; those statuses were not produced by the current sync (which leaves an order with no selection alone) and were probably set by a fixture or by hand.

Recommended handling (none applied):

| Option | Effect |
|---|---|
| A. Do nothing to the data (recommended) | Phase 3 shows them as **Not Started**. Sending a menu from the order (Phase 2) creates the selection through `ensureOrderMenuSelection` when the order has an Event Type, so no migration is needed. |
| B. Create selections for them in bulk | Not recommended: it would invent approval records and status history for fixtures, and could move Order status through the sync. |
| C. Delete the fixtures | Destructive; only with explicit approval, and the e2e suite recreates its own data anyway. |

## What this is not

This is not an approval to run any of the options. If AJ approves a cleanup, it will be a separate task with its own list, a dry run first, and a recorded result.
