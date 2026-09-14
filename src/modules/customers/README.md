# customers

Owning chunk: Chunk 9 — CRM Core, Group 9.2.

Built:

- `customer.ts` — `Customer` CRUD (name/phone/email/addressLine1/city/state/
  notes/isActive). No hard-delete UI/action — a CRM record with real
  Enquiry/Event history shouldn't disappear outright; the Active checkbox
  on `updateCustomer` is the only lifecycle control.
- `getCustomerTimeline` — merges this Customer's own `Enquiry`/`Event` rows
  (sorted newest-first) for the profile page's timeline view. No separate
  Activity/log table — nothing else writes customer-facing timeline entries
  yet (Order/Invoice/Payment are later chunks).

Admin UI lives at `src/app/(app)/customers/` (list + `[id]` detail/timeline
page), gated by the `customers` permission (present since Chunk 1). Reuses
the shared `CatalogBrowser`, same pattern as `inventory`/`addons`.
