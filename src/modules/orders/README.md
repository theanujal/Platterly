# orders

Owning chunk: Chunk 10 — Sales Pipeline: Quotation & Order. Quotation itself
(Group 10.1, `src/modules/quotations/`) was built as a deferred second pass,
once this module already existed — `resolveCatalogItem` is exported from
here specifically because `quotations/quotation.ts` reuses it for the
identical snapshot-pricing behavior on `QuotationItem`. `Order.quotationId`,
absent when this module was first built, is now a real `@relation` back to
`Quotation` — set by `quotations/quotation.ts`'s `convertQuotationToOrder`,
never by anything in this module.

Built:

- `order.ts` — `Order` CRUD (Customer/Event Information/Participant
  Information/Meal Planning/Products & Menu Items/Additional Details, all
  the fields the Updated doc's 7-section order form calls for except
  Pricing Information, which the doc itself never elaborates beyond what
  Meal Planning + Products already drive). `recalculateOrderTotals` is the
  one place `subtotal`/`total`/`balance` get computed — call it after any
  change to items/mealPlanEntries/discount/taxes/advance rather than
  reimplementing the math. `OrderItem`'s `name`/`unitPrice` are resolved
  and snapshotted server-side from the Menu/MenuItem/AddOn catalog at
  add-time (`resolveCatalogItem`), never trusted from client input.
- `sendOrderWhatsApp` — Group 10.5's "Create & Send WhatsApp" action, via
  Chunk 2.1's log-only `notify()` driver; a real send lands in Chunk 16.
- `createEventForOrder` — Group 10.6's "Event Creation Prompt", seeding a
  real `Event` from the Order's own Customer/EventType/date-range/venue and
  linking `Event.orderId`. Requires the Order to have an `eventTypeId` set
  first (`OrderEventTypeRequiredError`) — `Event.eventTypeId` is required,
  `Order`'s own isn't.

Admin UI lives at `src/app/(app)/orders/`, gated by the `orders` permission
(already present since Chunk 1 — no RBAC change needed this chunk, unlike
Chunk 9's `enquiries` addition). The Order detail page also renders
`OrderEventSection`, implementing the Order/Event judgment call
(`dev plans/index.md` #14): pre-Event, it *is* Group 10.6's creation prompt,
inline rather than a popup; post-Event, it's an inline editor for that
Event's own operational fields (EventType/Kitchen/guest count/venue) via
`event.ts`'s existing `updateEvent` — not just a link out to `/events/[id]`.

## Single Order vs Multi Order (2026-09-16)

`Order.orderKind` (`OrderKind`: `SINGLE` | `MULTI`) is an explicit, admin-set
classification, not inferred from day count — a single-day event with
different Menus per meal is still `MULTI`; a multi-day event with one Menu
throughout can still be `SINGLE`. The form gives it a *smart default* (same
day → `SINGLE`, different days → `MULTI`) that stops re-applying the moment
the admin touches the toggle directly.

- **Single Order** — unchanged: one Menu (plus optional extra items/add-ons)
  via the flat "Products & Menu Items" list (`OrderItem`s with
  `mealPlanEntryId: null`).
- **Multi Order** — each `MealPlanEntry` (a meal slot) can additionally carry
  its own `menuId` and its own scoped `OrderItem`s (`mealPlanEntryId` set),
  chosen from that specific Menu's own item list (`listMenuItemsByMenu` in
  `src/modules/menus/menu.ts`, the same direct-`MenuMenuItem`-assignment
  traversal `listStorefrontMenus` uses — category assignments are a display/
  selection-limit concern only, never a second source of "which items belong
  to this Menu"). `menuId`/scoped items are silently stripped server-side
  whenever `orderKind !== "MULTI"`, so a Single Order can never end up with
  stray per-slot Menu data.
- **Persistence is an upsert-by-`(date, mealType)` sync, not the old blind
  delete+recreate.** Once a `MealPlanEntry` can own child `OrderItem`s, a
  blind recreate would hand it a new id and cascade-delete those items on
  *every* unrelated form save. `replaceMealPlanEntries` now updates an
  existing (date, mealType) row in place (preserving its id) and only
  deletes rows genuinely removed from the new selection; each kept/created
  entry's own items are still a full delete+recreate scoped to it via a new
  `replaceMealPlanEntryItems` helper — same "resubmit-the-whole-list"
  convention `replaceOrderItems` already used, just one level narrower.
- `recalculateOrderTotals` needed **no change** — `order.items` already
  includes both whole-order and per-slot `OrderItem`s, so its existing sum
  is correct either way. A Menu assigned to a slot is a planning/kitchen
  label, not a pricing input by itself; the slot's own chosen items (or its
  Individual Pricing price field) are what actually add to the total.
- Real bug found via the new Multi Order E2E test, unrelated to this
  feature's own logic but load-bearing for it: `order-form.tsx`'s
  `enumerateDates` built its date-string list via
  `date.toISOString().slice(0, 10)`, which silently shifts the calendar date
  back one day in any positive-UTC-offset timezone (IST included — this
  app's primary market) because it round-trips a local `Date` through UTC.
  Harmless while nothing keyed off that exact string; became visibly wrong
  the moment a Multi Order's per-slot widgets needed a stable per-day key.
  Fixed with a `toLocalIsoDate` helper that reads the `Date`'s own local
  year/month/day instead of converting through UTC.

## Order-only Events (2026-09-16)

The standalone Events Dashboard/CRUD (`/events`, `/events/new`,
`/events/[id]`) was deleted — every Event now comes from an Order, and
`OrderEventSection` (`src/app/(app)/orders/[id]/_components/
order-event-section.tsx`) is the single remaining place an Event gets
created or edited. It folds in everything the deleted standalone page used
to expose beyond the original 4-field inline editor (EventType/Kitchen/
guest count/venue): Event name, start/end dates, status, notes, required
inventory (checklist + quantities, reusing `event.ts`'s existing
`replaceRequiredInventory` via `updateEvent`'s `requiredInventory` input),
and a Delete action (new `deleteOrderEventAction`, gated by the same
`events: ["delete"]` permission the old standalone `DeleteEventButton`
used). Customer reassignment is deliberately **not** exposed here — an
Event's customer follows its Order's; there is no independent Event
customer once every Event has an Order.

`getOrder`'s `events` include gained `requiredInventory: { select: {
inventoryId, quantity } }` so the inline editor can pre-fill the checklist
without a second round-trip. The inline editor's Card carries
`data-testid="order-event-editor"` — needed because it now shares field
labels ("Status", "Event Type", ...) with the Order form on the same page,
which E2E tests must scope through to disambiguate.

## Order Numbering (2026-09-16)

`Order.orderNumber` (e.g. `"AJ-0001"`) is assigned once, at `createOrder`,
from `Organization.orderNumberPrefix`/`orderNumberNextValue`/
`orderNumberPadding` (Kitchen Admin-configurable in Business Profile
settings) — never reassigned by `updateOrder`. The counter increments via a
single `prisma.organization.update({ data: { orderNumberNextValue: {
increment: 1 } } })`, which compiles to an atomic SQL `UPDATE`, so two
concurrent `createOrder` calls for the same tenant can never collide;
different tenants' counters are fully independent columns on their own
`Organization` row. `listOrders`'s `search` filter matches `orderNumber` in
addition to the customer's name.
