import "server-only";
import { prisma } from "@/lib/db";
import { roles } from "@/lib/auth/permissions";
import { MATRIX_MODULES, isEditableRole, sanitizeGrants, type RoleGrants } from "@/lib/auth/role-matrix";

type Statements = Record<string, readonly string[] | undefined>;

/** What a built-in role may do before any business changes it, limited to the editable modules. */
export function defaultGrants(roleId: string): Record<string, string[]> {
  const statements = ((roles as Record<string, { statements: Statements } | undefined>)[roleId]?.statements ?? {}) as Statements;
  const out: Record<string, string[]> = {};
  for (const mod of MATRIX_MODULES) out[mod.key] = [...(statements[mod.key] ?? [])].filter((a) => (mod.actions as readonly string[]).includes(a));
  return out;
}

/** The saved override for one role in one business, or null when the built-in grants apply. */
export async function getRoleOverride(organizationId: string, roleId: string): Promise<RoleGrants | null> {
  if (!isEditableRole(roleId)) return null;
  const row = await prisma.rolePermissionOverride.findUnique({ where: { organizationId_role: { organizationId, role: roleId } } });
  return row ? sanitizeGrants(row.grants) : null;
}

/** Every saved override of a business, keyed by role. */
export async function listRoleOverrides(organizationId: string): Promise<Record<string, RoleGrants>> {
  const rows = await prisma.rolePermissionOverride.findMany({ where: { organizationId } });
  return Object.fromEntries(rows.filter((r) => isEditableRole(r.role)).map((r) => [r.role, sanitizeGrants(r.grants)]));
}

/** The grants in force: the saved override when there is one, otherwise the built-in grants. */
export async function effectiveMatrixGrants(organizationId: string, roleId: string): Promise<Record<string, string[]>> {
  return (await getRoleOverride(organizationId, roleId)) ?? defaultGrants(roleId);
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
