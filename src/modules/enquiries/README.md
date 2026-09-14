# enquiries

Owning chunk: Chunk 9 — CRM Core, Group 9.3 (Lead/Enquiry, unified entity).

Built:

- `enquiry.ts` — `Enquiry` CRUD, one entity covering both the Updated
  doc's lightweight Lead fields (name/phone/leadSource) and the PRD's fuller
  Enquiry fields (eventType/eventDate/guestCount/venue/requirements/budget/
  preferredMenu/notes) — the same record maturing over time via `status`
  (NEW -> CONTACTED -> QUOTATION_SENT -> FOLLOW_UP -> CONVERTED -> LOST),
  not a separate boolean "lead toggle". Hard delete (nothing references
  Enquiry).
- `convertEnquiryToCustomer` — the Lead -> Customer step of Chunk 9's
  "Lead -> Customer -> Order -> Event" lifecycle. Links to an existing
  Customer when one is passed, otherwise creates a fresh one from the
  Enquiry's own name/phone; sets `status: CONVERTED`. Re-converting an
  already-converted Enquiry throws `AlreadyConvertedError` rather than
  silently re-linking.

Admin UI lives at `src/app/(app)/enquiries/` — a quick "Add New Lead" popup
(name/phone/source only, matching Updated doc §11's own form) and a fuller
Edit popup for everything else, gated by the new `enquiries` permission
(added to `src/lib/auth/permissions.ts` this chunk — no other module needed
it before).
