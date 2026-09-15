# events

Owning chunk: Chunk 9 — CRM Core.

`event-type.ts` was pulled forward on 2026-09-14 (a scoped-down version of
Chunk 9 Group 9.1 "Event Types" — a caterer's catalog of the *types* of
events they cater, e.g. "Wedding Event", each with a set of eligible Menus).
Extended on 2026-09-15 with `icon`/`sortOrder` (Updated doc §7's full
event-type model) and `reorderEventTypes` (Move Up/Down only, no drag — the
project's standing convention since the Menu Category rework). Its admin UI
moved from `/events` to `/events/types` the same day, once the real Events
Dashboard needed the bare `/events` route.

`event.ts` (new 2026-09-15, Chunk 9 Groups 9.4) — the real transactional
`Event`: Customer/EventType FKs, an optional `assignedKitchen` (only one
default Kitchen usable until Chunk 23's multi-location UI), a date range
(not a single date), and a required-inventory join
(`EventRequiredInventory`, quantity per item). `Event.eventTypeId`/
`customerId` are `onDelete: Restrict` — `event-type.ts`'s `deleteEventType`
and `inventory.ts`'s `deleteInventoryItem` both pre-check for in-use Events
and throw a friendly error rather than relying on the DB's own FK-violation
error (same convention as `slug.ts`'s `SlugTakenError`). `Event.orderId`
got its real `@relation` to `Order` in Chunk 10 (`onDelete: SetNull` —
deleting an Order never deletes its Event, only unlinks it), on top of the
same bare column this chunk left in place for exactly that. `listKitchens` also lives here — it's Event-specific data (the Events
Dashboard's location filter, the Event form's kitchen picker), not a
general Kitchen CRUD module (none exists; Kitchen itself is still schema-only
until Chunk 23).

Chunk 9 Groups 9.2/9.3 (Customer, Enquiry) live in their own
`src/modules/customers/`/`src/modules/enquiries/` folders, not here.

## Standalone Events Dashboard removed (2026-09-16)

The real Events Dashboard/CRUD described above (`/events`, `/events/new`,
`/events/[id]`, its search/status/location filter bar) was deleted once
Chunk 10's `OrderEventSection` existed to create/edit an Event inline from
its Order — AJ judged the standalone section "no meaning" now that every
Event comes from an Order, and the Customer-only creation path a deliberate
retirement, not just a relocation (see `src/modules/orders/README.md`'s
"Order-only Events" section for what replaced it). `event.ts`'s own
functions (`createEvent`/`updateEvent`/`deleteEvent`/`getEvent`/
`listKitchens`) are unchanged and still fully exercised — just called from
`src/app/(app)/orders/actions.ts` now instead of a dedicated `events/
actions.ts`. `listEvents`/`EventListFilter` (the deleted Dashboard's own
search/status/kitchen filter query) has no remaining caller — kept in
`event.ts` rather than deleted, since removing a working, harmless function
serves no purpose and it costs nothing to leave for a future admin surface
that might want the same query.

Event Types (this file's other subject) then moved up to occupy the
vacated `/events` route (`/events/types` → `/events`, `/events/types/new`
→ `/events/new`, `/events/types/[id]` → `/events/[id]`) — it's now the
*only* thing `src/app/(app)/events/` serves, page-based (not popup dialogs,
unlike Menu Catalog/Add-ons/Inventory — an established distinction from the
Chunk 6 rework, carried forward). The sidebar's nav item is labelled
"Event Types", not "Events". Still gated by the same `events` permission
(Chunk 1) — no separate `eventTypes` RBAC resource was ever created.
