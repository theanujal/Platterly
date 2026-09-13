# tenants

Owning chunk: Chunk 1 (schema) / Chunk 3 Group 3.2 (Super Admin CRUD).

Domain logic (framework-agnostic — no auth checks inside; callers under `src/app/super/(admin)/tenants/` guard with `requireSuperAdmin()` first):

- `tenant.ts` — `createTenant`/`updateTenant`/`suspendTenant`/`activateTenant`/`deactivateTenant`/`overrideSlug`/`listTenants`/`getTenant`. Every mutation writes to `AuditLog` via `src/lib/audit/audit.ts`, scoped to the target tenant's own `organizationId` (the Super Admin actor has no org of their own).
- `slug.ts` — `validateSlugFormat()`, the storefront-slug format rule (updated doc §14/§26). Chunk 8's self-service slug UI should reuse this same validator rather than duplicating the rule.

No hard-delete path exists — `deactivateTenant` is a soft status change; `Organization` rows and their `AuditLog` history are never destroyed.
