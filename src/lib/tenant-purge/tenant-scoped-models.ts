/**
 * Chunk 5 Group 5.4 — explicit, hand-maintained list of Prisma delegate names
 * purged by "Delete All Data" (Settings → Danger Zone).
 *
 * Prisma 7.10.0's `prisma-client` generator (per-model-file, ESM) exposes no
 * runtime model-introspection API — no `Prisma.dmmf`, no `Prisma.ModelName`
 * (verified against `src/generated/prisma/`; the only runtime data model
 * lives in an internal generated file explicitly marked "under no
 * circumstances should you import this file directly"). So this array is
 * the actual source of truth for what gets deleted, not a convenience
 * cache of something reflectable — `__tests__/tenant-scoped-models.test.ts`
 * parses `prisma/schema.prisma` directly and fails the build the moment a
 * new `organizationId`-bearing model is added without being classified
 * here or in `PURGE_EXEMPT_MODELS` below. That guardrail test is what makes
 * this "schema-driven" in practice.
 */
export const TENANT_SCOPED_DELEGATES = [
  "invitation",
  "branch",
  "kitchen",
  "store",
  "notification", // notificationLog cascades automatically (DB-level onDelete: Cascade via notificationId)
  "whatsAppMessage",
  "secureAccessToken",
  "tenantSetting",
  // Chunk 6 (reworked 2026-09-14) — menuMenuItem/menuItemCategory/
  // menuCategoryAssignment/eventTypeMenu have no organizationId of their
  // own; they cascade automatically (DB-level onDelete: Cascade) when their
  // parent menu/menuItem/menuCategory/eventType row here is deleted.
  "menuCategory",
  "menuItem",
  "menu",
  // Chunk 9 — Event has onDelete: Restrict FKs to Customer/EventType, and
  // its child eventRequiredInventory (no organizationId of its own,
  // cascades off Event automatically) has onDelete: Restrict to Inventory.
  // purge.ts runs this array in order inside one transaction, so "event"
  // MUST precede "eventType"/"inventory"/"customer" below or their
  // deleteMany calls fail on the still-referencing Event rows.
  "event",
  "eventType",
  "addOn",
  // Chunk 7 — inventoryTransaction has no organizationId of its own; it
  // cascades automatically (DB-level onDelete: Cascade) off its parent
  // inventory row.
  "inventory",
  "enquiry",
  "customer",
] as const;

/**
 * `organizationId`-bearing models deliberately NEVER purged by Delete All
 * Data, and why:
 * - Member: purging your own membership row would lock the acting owner
 *   (and everyone else) out of the org they just purged — the Organization
 *   row survives the purge, so it must stay reachable. Worse: an owner with
 *   no Member row left would self-heal into a brand-new, different
 *   Organization on their very next request (see `auto-provision.ts`),
 *   permanently orphaning the one they just purged.
 * - Subscription: purging leaves the tenant with zero plan rows, which
 *   plan-limit checks elsewhere aren't designed to handle, and destroys
 *   billing history the product doc says must never be deleted.
 * - AuditLog: the audit trail — including the entry this very purge routine
 *   writes describing itself — is permanent regardless of data purges,
 *   matching existing precedent (`tenant.ts`'s `deactivateTenant` comment).
 */
export const PURGE_EXEMPT_MODELS = ["Member", "Subscription", "AuditLog"] as const;
