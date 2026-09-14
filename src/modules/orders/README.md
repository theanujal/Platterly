# orders

Owning chunk: Chunk 10 — Sales Pipeline: Quotation & Order. Quotation itself
(Group 10.1) is deferred to a later pass — see `dev plans/chunk-10-quotation-order.md`.

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
