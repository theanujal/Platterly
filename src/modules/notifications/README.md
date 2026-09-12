# notifications

Owning chunk: Chunk 2 (interface, `src/lib/notifications/`) / Chunk 16 (concrete WhatsApp/ZeptoMail/Push/SMS providers).

This is a §57 boundary-map stub, not where the code lives — `notifications`/`audit`/`settings`/`auth` (and other cross-cutting platform services) are implemented under `src/lib/` since many unrelated modules consume them. `src/modules/` is reserved for actual domain/business modules (customers, events, orders, menus, etc.) starting Chunk 6/9.
