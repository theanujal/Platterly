# quotations

Owning chunk: Chunk 10 Group 10.1 — the deferred piece of the Sales
Pipeline chunk, built once `orders` already existed.

Built:

- `quotation.ts` — `Quotation` CRUD, PRD §20's exact 7-state machine
  (Draft→Sent→Viewed→Changes Requested→Accepted→Rejected→Expired).
  `recalculateQuotationTotals` mirrors `orders/order.ts`'s own totals
  function (`subtotal` from line items; `total` = subtotal − discount +
  taxes + additionalCharges + deliveryCharges — the two charge fields have
  no Order equivalent, matching Order's leaner PRD §21 field list).
- `sendQuotation`/`getOrIssueQuotationLink` — issues (or reuses, if still
  live) a `SecureAccessToken` (Chunk 2.4) for the public approval link and
  sends it via Chunk 2.1's `notify()` driver.
- `markQuotationViewed`/`acceptQuotation`/`rejectQuotation`/
  `requestQuotationChanges` — the customer-facing, token-resolved
  transitions (no `organizationId`/session from the caller, both resolved
  from the token via `resolveQuotationToken`). Their `AuditLog` rows carry
  no `actorUserId` — there's no authenticated app user on the public page.
- `convertQuotationToOrder` — only from ACCEPTED, requires event dates
  already set (`QuotationEventDatesRequiredError` otherwise). Copies each
  `QuotationItem`'s frozen snapshot directly onto new `OrderItem` rows
  (never re-resolved from the live catalog — an accepted quotation's price
  must never silently drift), and folds `additionalCharges`+
  `deliveryCharges` into the new Order's `taxes` so the converted total
  still matches.
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
