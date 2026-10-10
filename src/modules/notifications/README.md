# notifications

Owning chunk: Chunk 2 (interface, `src/lib/notifications/`) / Chunk 16 (concrete WhatsApp/ZeptoMail/Push providers).

This is a §57 boundary-map stub, not where the code lives — `notifications`/`audit`/`settings`/`auth` (and other cross-cutting platform services) are implemented under `src/lib/` since many unrelated modules consume them. `src/modules/` is reserved for actual domain/business modules (customers, events, orders, menus, etc.) starting Chunk 6/9.

## WhatsApp (Wacrm), 2026-10-09

WhatsApp goes **only to the kitchen's own team, never to customers**, as one message to the owner's signup phone
(`User.phone`). Seven messages only, listed in `src/lib/notifications/whatsapp/templates.ts` (new order, order sent
to kitchen, menu sent for approval, menu approved by the client, payment received, a Monday overdue digest, and a
daily "events tomorrow" summary at 8 am IST). An event not in that list is never sent. Each is an approved Meta
template, listed in `WACRM_TEMPLATES_APPROVED`; until then it goes as plain text, which WhatsApp only accepts inside
the 24-hour window. While `WACRM_TEST_TO` is set every message goes to that one number. Env: `WACRM_BASE_URL`,
`WACRM_API_KEY`, `WACRM_TEST_TO`, `WACRM_TEMPLATES_APPROVED`, `WACRM_TEMPLATE_LANGUAGE`. Sending is off under Vitest.
The Settings -> WhatsApp switches do not gate these messages.
