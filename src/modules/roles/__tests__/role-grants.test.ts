import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { statement } from "@/lib/auth/permissions";
import { MATRIX_MODULES, EDITABLE_ROLE_IDS, sanitizeGrants } from "@/lib/auth/role-matrix";
import { roleAllows, saveRoleGrants, resetRoleGrants, defaultGrants, effectiveMatrixGrants } from "../role-grants";

const orgIds: string[] = [];
afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  orgIds.length = 0;
});
async function makeOrg() {
  const id = `org-rp-${Math.random().toString(36).slice(2, 10)}`;
  await prisma.organization.create({ data: { id, name: "Role Test", slug: id, createdAt: new Date() } });
  orgIds.push(id);
  return id;
}

describe("role matrix definition", () => {
  it("only lists modules and actions that exist in the permission statement", () => {
    for (const mod of MATRIX_MODULES) {
      const known = (statement as Record<string, readonly string[]>)[mod.key];
      expect(known, mod.key).toBeDefined();
      for (const action of mod.actions) expect(known, `${mod.key}:${action}`).toContain(action);
    }
  });
  it("never offers the owner role, team management, settings or the data purge", () => {
    expect(EDITABLE_ROLE_IDS as readonly string[]).not.toContain("owner");
    const keys = MATRIX_MODULES.map((m) => m.key) as string[];
    for (const locked of ["tenant", "users", "settings"]) expect(keys).not.toContain(locked);
  });
  it("sanitizeGrants drops unknown modules/actions and adds View when something else is on", () => {
    const clean = sanitizeGrants({ orders: ["edit", "fly"], hacker: ["view"], tenant: ["delete"], reports: [] });
    expect(clean.orders).toEqual(["view", "edit"]);
    expect(clean.reports).toEqual([]);
    expect(Object.keys(clean)).toHaveLength(MATRIX_MODULES.length);
    expect(clean).not.toHaveProperty("tenant");
  });
});

describe("roleAllows with per-business changes", () => {
  it("uses the built-in grants until a business changes them, then the change wins, then reset restores the defaults", async () => {
    const org = await makeOrg();
    expect(await roleAllows(org, "staff", { orders: ["view"] })).toBe(true);
    expect(await roleAllows(org, "staff", { orders: ["create"] })).toBe(false);

    await saveRoleGrants(org, "staff", { orders: ["view", "create"], customers: [] });
    expect(await roleAllows(org, "staff", { orders: ["create"] })).toBe(true);
    expect(await roleAllows(org, "staff", { customers: ["view"] })).toBe(false);
    expect((await effectiveMatrixGrants(org, "staff")).orders).toEqual(["view", "create"]);

    await resetRoleGrants(org, "staff");
    expect(await roleAllows(org, "staff", { orders: ["create"] })).toBe(false);
    expect((await effectiveMatrixGrants(org, "staff")).customers).toEqual(defaultGrants("staff").customers);
  });

  it("is per business: another business keeps the built-in grants", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    await saveRoleGrants(a, "staff", { orders: ["view", "create", "edit", "delete"] });
    expect(await roleAllows(a, "staff", { orders: ["delete"] })).toBe(true);
    expect(await roleAllows(b, "staff", { orders: ["delete"] })).toBe(false);
  });

  it("never lets a change widen anything outside the matrix (settings, users, tenant, bypass)", async () => {
    const org = await makeOrg();
    await saveRoleGrants(org, "manager", { settings: ["view", "edit"], users: ["delete"], tenant: ["delete"], orders: ["view", "bypass_date_restriction"] });
    expect(await roleAllows(org, "manager", { settings: ["edit"] })).toBe(false);
    expect(await roleAllows(org, "manager", { users: ["delete"] })).toBe(false);
    expect(await roleAllows(org, "manager", { tenant: ["delete"] })).toBe(false);
    expect(await roleAllows(org, "manager", { orders: ["bypass_date_restriction"] })).toBe(false);
  });

  it("owner is never affected by a change, and cannot be changed", async () => {
    const org = await makeOrg();
    await expect(saveRoleGrants(org, "owner", { orders: [] })).rejects.toThrow();
    expect(await roleAllows(org, "owner", { orders: ["delete"], settings: ["edit"], tenant: ["delete"] })).toBe(true);
  });

  it("denies unknown roles and handles several roles on one member", async () => {
    const org = await makeOrg();
    expect(await roleAllows(org, "nonsense", { orders: ["view"] })).toBe(false);
    expect(await roleAllows(org, "staff,accounts", { invoices: ["view"] })).toBe(true);
  });
});
