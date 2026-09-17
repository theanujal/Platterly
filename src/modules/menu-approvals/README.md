# menu-approvals

Owning chunk: Chunk 11 — Menu Selection, Approval Workflow & Kitchen Handoff.

Built 2026-09-17 per AJ's redesign (see `dev plans/chunk-11-menu-selection-approval-kitchen.md`): no per-event link/token — the customer reaches this through Chunk 8's tenant-wide Public Menu Link, identified by phone number, with a brand-new Order + Event created on every submission (never mapped to an existing one, even for a repeat customer).

`menu-approval.ts`:
- `submitEventDetails` — Group 11.2's whole intake flow (find-or-create Customer by phone -> new Order -> its Event -> a MenuSelection auto-advanced to CUSTOMER_REVIEWING).
- The PRD §29 state machine (`VALID_TRANSITIONS`) + named transition wrappers, and `setMenuSelectionItems` (§30 versioning: snapshots into `MenuVersion`/`MenuVersionItem` once past the pre-approval statuses, mutates in place before that).
- `listMenuSelectionsForKitchen` — Group 11.5's Kitchen Dashboard listing, no separate data model.
