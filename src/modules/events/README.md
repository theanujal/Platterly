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
error (same convention as `slug.ts`'s `SlugTakenError`). `Event.orderId` is
a bare column with no `@relation` yet — Chunk 10 hasn't built `Order`; it
adds the real FK on top of this same column, no migration needed here.
`listKitchens` also lives here — it's Event-specific data (the Events
Dashboard's location filter, the Event form's kitchen picker), not a
general Kitchen CRUD module (none exists; Kitchen itself is still schema-only
until Chunk 23).

Admin UI lives at `src/app/(app)/events/` — the real Events Dashboard
(search/status filter/location filter/Create/Refresh, Updated doc §9) at
the bare route, Event Types moved to `/events/types`, both page-based
(not popup dialogs, unlike Menu Catalog/Add-ons/Inventory — an established
distinction from the Chunk 6 rework, carried forward). Gated by the
`events` permission (Chunk 1).

Chunk 9 Groups 9.2/9.3 (Customer, Enquiry) live in their own
`src/modules/customers/`/`src/modules/enquiries/` folders, not here.
