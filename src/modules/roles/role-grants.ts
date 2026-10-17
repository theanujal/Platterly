import "server-only";
import { prisma } from "@/lib/db";
import { roles } from "@/lib/auth/permissions";
import { MATRIX_MODULES, SENSITIVE_KEYS, isEditableRole, sanitizeGrants, type RoleGrants, type SensitiveKey } from "@/lib/auth/role-matrix";

type Statements = Record<string, readonly string[] | undefined>;

/** What a built-in role may do before any business changes it, limited to the editable modules. */
export function defaultGrants(roleId: string): Record<string, string[]> {
  const statements = ((roles as Record<string, { statements: Statements } | undefined>)[roleId]?.statements ?? {}) as Statements;
  const out: Record<string, string[]> = {};
  for (const mod of MATRIX_MODULES) out[mod.key] = [...(statements[mod.key] ?? [])].filter((a) => (mod.actions as readonly string[]).includes(a));
  return out;
}

/**
 * What an override replaces: only the modules it was saved with. A module added later (Kitchen, Recipes, Sensitive data) is
 * absent from an older override and so keeps its built-in grants, which are the least-privileged preset; an old override can
 * neither switch the new modules off for a role that has them by default nor switch any sensitive key on.
 */
function savedModules(stored: unknown): RoleGrants {
  const clean = sanitizeGrants(stored);
  const present = stored && typeof stored === "object" ? stored as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(clean).filter(([key]) => key in present)) as RoleGrants;
}

/** The saved override for one role in one business, or null when the built-in grants apply. */
export async function getRoleOverride(organizationId: string, roleId: string): Promise<RoleGrants | null> {
  if (!isEditableRole(roleId)) return null;
  const row = await prisma.rolePermissionOverride.findUnique({ where: { organizationId_role: { organizationId, role: roleId } } });
  return row ? savedModules(row.grants) : null;
}

/** Every saved override of a business, keyed by role. */
export async function listRoleOverrides(organizationId: string): Promise<Record<string, RoleGrants>> {
  const rows = await prisma.rolePermissionOverride.findMany({ where: { organizationId } });
  return Object.fromEntries(rows.filter((r) => isEditableRole(r.role)).map((r) => [r.role, savedModules(r.grants)]));
}

/** The grants in force: the saved override when there is one, otherwise the built-in grants. */
export async function effectiveMatrixGrants(organizationId: string, roleId: string): Promise<Record<string, string[]>> {
  return { ...defaultGrants(roleId), ...(await getRoleOverride(organizationId, roleId)) };
}

export async function saveRoleGrants(organizationId: string, roleId: string, grants: unknown, actorUserId?: string) {
  if (!isEditableRole(roleId)) throw new Error("This role cannot be changed.");
  const clean = sanitizeGrants(grants);
  await prisma.rolePermissionOverride.upsert({
    where: { organizationId_role: { organizationId, role: roleId } },
    create: { organizationId, role: roleId, grants: clean, updatedBy: actorUserId },
    update: { grants: clean, updatedBy: actorUserId },
  });
  return clean;
}

export async function resetRoleGrants(organizationId: string, roleId: string) {
  if (!isEditableRole(roleId)) throw new Error("This role cannot be changed.");
  await prisma.rolePermissionOverride.deleteMany({ where: { organizationId, role: roleId } });
}

/**
 * Whether a member holding `memberRole` (one role, or several joined by commas as Better Auth stores them) may do all of
 * `wanted`. Built-in grants decide everything outside the editable modules; inside them a saved override replaces the built-in
 * grants. Owner is never overridden. Deny by default.
 */
export async function roleAllows(organizationId: string, memberRole: string, wanted: Record<string, readonly string[] | undefined>): Promise<boolean> {
  const memberRoles = memberRole.split(",").map((r) => r.trim()).filter(Boolean);
  for (const roleId of memberRoles) {
    const builtIn = ((roles as Record<string, { statements: Statements } | undefined>)[roleId]?.statements ?? {}) as Statements;
    const override = roleId === "owner" ? null : await getRoleOverride(organizationId, roleId);
    const allowed = Object.entries(wanted).every(([resource, actions]) => {
      const granted = override && resource in override ? override[resource as keyof RoleGrants] ?? [] : builtIn[resource] ?? [];
      return (actions ?? []).every((action) => granted.includes(action));
    });
    if (allowed) return true;
  }
  return false;
}

/**
 * The actions of one resource that `memberRole` holds in this business (the union over its roles), by the same rule as
 * `roleAllows`: a saved override replaces the built-in grants for the modules it lists. Owner is never overridden.
 */
export async function grantedActions(organizationId: string, memberRole: string, resource: string): Promise<string[]> {
  const out = new Set<string>();
  for (const roleId of memberRole.split(",").map((r) => r.trim()).filter(Boolean)) {
    const builtIn = ((roles as Record<string, { statements: Statements } | undefined>)[roleId]?.statements ?? {}) as Statements;
    const override = roleId === "owner" ? null : await getRoleOverride(organizationId, roleId);
    const granted = override && resource in override ? override[resource as keyof RoleGrants] ?? [] : builtIn[resource] ?? [];
    for (const action of granted) out.add(action);
  }
  return [...out];
}

/** Which sensitive-data keys `memberRole` holds in this business. Every key is present, false when not granted. */
export async function sensitiveKeysFor(organizationId: string, memberRole: string): Promise<Record<SensitiveKey, boolean>> {
  const granted = new Set(await grantedActions(organizationId, memberRole, "sensitive"));
  return Object.fromEntries(SENSITIVE_KEYS.map((key) => [key, granted.has(key)])) as Record<SensitiveKey, boolean>;
}
