# menu-approvals

Owning chunk: Chunk 11 — Menu Selection, Approval Workflow & Kitchen Handoff.

Built 2026-09-17 per AJ's redesign (see `dev plans/chunk-11-menu-selection-approval-kitchen.md`): no per-event link/token — the customer reaches this through Chunk 8's tenant-wide Public Menu Link, identified by phone number, with a brand-new Order + Event created on every submission (never mapped to an existing one, even for a repeat customer).

`menu-approval.ts`:
- `submitEventDetails` — Group 11.2's whole intake flow (find-or-create Customer by phone -> new Order -> its Event -> a MenuSelection auto-advanced to CUSTOMER_REVIEWING).
- The PRD §29 state machine (`VALID_TRANSITIONS`) + named transition wrappers, and `setMenuSelectionItems` (§30 versioning: snapshots into `MenuVersion`/`MenuVersionItem` once past the pre-approval statuses, mutates in place before that).
- `listMenuSelectionsForKitchen` — Group 11.5's Kitchen Dashboard listing, no separate data model.

Group 11.3's admin UI (built 2026-09-18) lives at `src/app/(app)/menu-approvals/` (`/menu-approvals` queue + `/menu-approvals/[id]` review), gated on the existing `menus: ["approve"]` RBAC action (owner/admin only, same as `events: ["approve"]`'s existing pattern). Items are editable only in `KITCHEN_REVIEWING`/`KITCHEN_CHANGES_REQUESTED` — `KITCHEN_APPROVED` has no transition back to review in `VALID_TRANSITIONS`, so the only remaining admin action past approval is Lock. Group 11.5 (the actual Kitchen Dashboard — Pending/Preparing/Ready/Completed derived from locked menus) is still Pending.

## Chunk 12 (2026-09-25) — the public multi-step order flow

`storefront-draft.ts` is the server side of `/{slug}` → `/{slug}/plan/{draftId}`: `startDraft` saves the visitor as a Lead (Customer, `leadSource STOREFRONT`, marketing consent recorded) and opens a `StorefrontDraft`; `saveDraftDetails/MenuChoice/Items/Venue` autosave each step with server-side validation; `buildDraftQuote` is the one pricing calculation (Review displays it, `submitDraft` books it); `submitDraft` atomically claims the draft, then creates Order → Event → MenuSelection (Customer-linked, straight to `KITCHEN_REVIEWING`). `listAbandonedOrders` powers `/abandoned-orders` (idle 30 min = abandoned; drafts purged after 90 days, lazily — no cron; the Lead stays). `storefront-selection.ts` (`splitPicks`) is the client-safe single definition of regular-vs-extra picks; `storefront-draft-constants.ts` holds the step list, thresholds and the consent default. `setMenuSelectionItems` now always stores quantity 1 and accepts an `isExtra` flag; `setCustomMenuPricePerPlate` lets the kitchen quote a Custom Menu. `submitEventDetails` (above) is legacy — kept only as a fixture for the state-machine tests.
