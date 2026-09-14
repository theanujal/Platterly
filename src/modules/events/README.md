# events

Owning chunk: Chunk 9 — CRM Core.

`event-type.ts` was pulled forward on 2026-09-14 (a scoped-down version of
Chunk 9 Group 9.1 "Event Types" — a caterer's catalog of the *types* of
events they cater, e.g. "Wedding Event", each with a set of eligible Menus).
It is deliberately named `EventType`, not `Event` — Chunk 9 Group 9.4
reserves the bare name `Event` for a much bigger transactional model
(Customer, date range, kitchen, required-inventory link, order linkage).
When Chunk 9 lands, extend this folder with `event.ts`/`customer.ts`/etc.
alongside `event-type.ts` rather than colliding with it.
