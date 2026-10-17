# quotations

Owning chunk: Chunk 10 Group 10.1 — the deferred piece of the Sales
Pipeline chunk, built once `orders` already existed.

Built:

- `quotation.ts` — `Quotation` CRUD, PRD §20's exact 7-state machine
  (Draft→Sent→Viewed→Changes Requested→Accepted→Rejected→Expired).
  `recalculateQuotationTotals` mirrors `orders/order.ts`'s own totals
  function (`subtotal` from line items; `total` = subtotal − discount +
  transportation cost + extra / service cost + custom charge lines). These are
  the same charge lines as an Order's Pricing Details, each of the first three
  a rupee amount or a percentage of the subtotal. The old `taxes`,
  `additionalCharges` and `deliveryCharges` columns are no longer read; their
  values were moved into the new fields by migration
  `20261017120000_quotation_order_charges`.
- `sendQuotation`/`getOrIssueQuotationLink` — issues (or reuses, if still
  live) a `SecureAccessToken` (Chunk 2.4) for the public approval link and
  sends it via Chunk 2.1's `notify()` driver. It also reports whether an email really went out (customer has an email and Settings -> Email keeps the Quotation message on), which the detail page shows after Send.
- `markQuotationViewed`/`acceptQuotation`/`rejectQuotation`/
  `requestQuotationChanges` — the customer-facing, token-resolved
  transitions (no `organizationId`/session from the caller, both resolved
  from the token via `resolveQuotationToken`). Their `AuditLog` rows carry
  no `actorUserId` — there's no authenticated app user on the public page.
- `convertQuotationToOrder` — only from ACCEPTED, requires event dates
  already set (`QuotationEventDatesRequiredError` otherwise). Copies each
  `QuotationItem`'s frozen snapshot directly onto new `OrderItem` rows
  (never re-resolved from the live catalog — an accepted quotation's price
  must never silently drift), and copies the charge lines
  across as they are (same fields on the Order).
- `markQuotationExpired` — admin-only escalation, blocked once a Quotation
  is already ACCEPTED/REJECTED/EXPIRED.

Admin UI lives at `src/app/(app)/quotations/`, gated by the new
`quotations` RBAC resource (added this chunk, same pattern as Chunk 9's
`enquiries`). The public customer approval page lives at
`src/app/quote/[token]/` — **not** `/quotations/[token]`, since Next.js App
Router forbids two different dynamic-segment names at the same path depth
and the admin route already owns `/quotations/[id]`.

`Order.quotationId` (absent when `orders` was first built, per the
"leave it out until the referenced model exists" convention) is now a real
`@relation` back to this module's `Quotation`.

## Required fields (2026-10-18)

A quotation can't be saved, sent or converted to an order without its event type, event date, venue location (`venue`) and at least one adult (`required-fields.ts`, shared by the form and the actions). The customer is checked on its own. The meals, dishes and prices come after, and the menu built on the quotation moves into the order's Menu Approval tab on Convert to Order. The module functions themselves (`createQuotation`, `sendQuotation`, ...) stay permissive; the checks sit in `quotations/actions.ts`. A rejected quotation is simply Rejected: nothing else closes the lead.

## The quotation form (2026-10-18)

Four tabs, in this order: Order Details (Customer Details and Guest Information side by side, then Event Information: Order Type, Event Type, Event Date or Dates, Venue Location), Build Menu (the sectioned menu planner an order's Menu Approval tab uses, with a banner for the quotation's stage and alerts for no event date, meals outside the event dates and no adults; per-plate prices are set in Pricing), Pricing (the same Pricing Details as an order) and Additional Details. The old free-text Event Address field is no longer on the form; a value saved earlier stays on the quotation. Converting copies the meals into the order, whose Menu Approval tab then owns the menu.

## Locked once sent (2026-10-18)

Only a Draft, or a quotation the customer sent back (Changes Requested), can be edited (`quotation-lock.ts`). Once it is Sent or Viewed every field is read-only and the Save button is gone, as on an order while its menu is with the customer, with one notice and a **Recall to edit** button; `recallQuotation` makes it a Draft again and switches the customer's link off (sending it again issues a new one). An accepted, rejected or expired quotation is final. `updateQuotationAction` refuses an edit of a locked quotation (the module's `updateQuotation` itself stays permissive). Valid Until uses the shared date picker, and a Multi Order chosen by hand with one day and one meal asks whether it should be a Single Order.

## What the customer sees while the team edits (2026-10-18)

The customer's page reads the live quotation, which is safe because it can't change while they can act on it (Sent and Viewed are locked; Recall switches the link off). While a quotation is in Changes Requested, the customer's link stays on but shows only "We're updating your quotation" with their own note, no menu, prices or buttons, so half-finished edits stay private. Sending it again brings the quotation back on the same link.

## The email when a quotation becomes an order (2026-10-18)

`convertQuotationToOrderAction` calls `onQuotationConverted` once the order, its event and its menu approval exist: the customer gets "Thank you for accepting our quotation" with their order number, and that the order details follow by email and the work starts once they approve (`quotationConvertedEmail`, event `quotation.converted`, switch Settings -> Email -> **Order Accepted**, on by default). The order is created with `skipCustomerNotice`, so the generic "order received" email is not also sent; the team's new-order alert still goes out as for any order.
