# customers

Owning chunk: Chunk 9 — CRM Core, Group 9.2. Lead/Enquiry merged in
(2026-09-17, AJ) — see below.

Built:

- `customer.ts` — `Customer` CRUD (name/phone/email/notes/isActive), plus
  the merged Lead/Enquiry fields (`isEnquiry`/`leadSource`). One record per
  person, not two: there is no separate Enquiry entity or module — "Is this
  an enquiry?" is a boolean on the same Customer row, and its Lead
  Information (source/notes) lives on that row's own `leadSource`/`notes`
  columns.
- `status` (Lead vs Customer) is **derived**, not stored: `listCustomers`/
  `getCustomer` compute it from whether the Customer has any `Order` rows
  (`statusOf`) rather than syncing a persisted column via order-creation
  hooks — a Customer's status can never drift out of sync with its own
  Order relationship this way. A newly created person has no Orders yet, so
  they read as `LEAD` by construction; placing an Order flips them to
  `CUSTOMER` automatically, with no second record ever created.
- `getCustomerTimeline` — merges this Customer's own `Order`/`Event` rows
  (sorted newest-first) for the profile page's timeline view. No separate
  Activity/log table — Invoice/Payment are later chunks.

Admin UI lives at `src/app/(app)/customers/` (list + `[id]` detail/timeline
page), gated by the `customers` permission (present since Chunk 1). Reuses
the shared `CatalogBrowser`, same pattern as `inventory`/`addons`; the
Lead/Customer status filter is a second `CatalogFilterOption` alongside the
existing Active/Inactive one.
