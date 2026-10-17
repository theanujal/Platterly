import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { SENSITIVE_KEYS } from "@/lib/auth/role-matrix";
import { grantedActions, listRoleOverrides, roleAllows, saveRoleGrants, sensitiveKeysFor, effectiveMatrixGrants } from "../role-grants";

/**
 * Sensitive data (prices, costs, payments, financial reports, commercial documents) is a layer of its own (Roles & Permissions
 * redesign, AJ 2026-10-17). These tests cover who holds which key by default, that the Admin can grant and revoke a key per
 * business and it takes effect at once, that one business never affects another, and that an older saved change can neither
 * switch a key on nor wipe the new modules' defaults.
 */
const orgIds: string[] = [];
afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  orgIds.length = 0;
});
async function makeOrg() {
  const id = `org-sd-${Math.random().toString(36).slice(2, 10)}`;
  await prisma.organization.create({ data: { id, name: "Sensitive Test", slug: id, createdAt: new Date() } });
  orgIds.push(id);
  return id;
}
const heldBy = async (org: string, role: string) => Object.entries(await sensitiveKeysFor(org, role)).filter(([, held]) => held).map(([key]) => key).sort();

describe("sensitive keys by default", () => {
  it("the Admin (owner) holds every key", async () => {
    const org = await makeOrg();
    expect(await heldBy(org, "owner")).toEqual([...SENSITIVE_KEYS].sort());
  });

  it("Manager, Staff, Kitchen and Sales & Event hold none: opening a module never shows a price", async () => {
    const org = await makeOrg();
    for (const role of ["manager", "staff", "kitchen", "salesEvents"]) expect(await heldBy(org, role), role).toEqual([]);
  });

  it("Store / Inventory holds supplier costs only", async () => {
    const org = await makeOrg();
    expect(await heldBy(org, "inventoryTeam")).toEqual(["supplierCosts"]);
  });

  it("Accounts holds order prices, payment details, financial reports and commercial documents, and not the rest", async () => {
    const org = await makeOrg();
    expect(await heldBy(org, "accounts")).toEqual(["commercialDocuments", "financialReports", "orderPrices", "paymentDetails"]);
  });

  it("a role that does not exist, or a blank role, holds nothing", async () => {
    const org = await makeOrg();
    expect(await heldBy(org, "madeup")).toEqual([]);
    expect(await heldBy(org, "")).toEqual([]);
  });

  it("module access never implies a key: a role with Orders edit and Quotations edit still holds no price key", async () => {
    const org = await makeOrg();
    expect(await roleAllows(org, "salesEvents", { orders: ["view", "create", "edit"], quotations: ["view", "create", "edit"] })).toBe(true);
    expect(await roleAllows(org, "salesEvents", { sensitive: ["orderPrices"] })).toBe(false);
    expect(await roleAllows(org, "manager", { orders: ["edit"], invoices: ["view"], sensitive: ["orderPrices"] })).toBe(false);
  });
});

describe("the Admin grants and revokes a key", () => {
  it("granting order prices to the Manager takes effect at once, and revoking it takes it away again", async () => {
    const org = await makeOrg();
    expect(await sensitiveKeysFor(org, "manager").then((k) => k.orderPrices)).toBe(false);

    const before = await effectiveMatrixGrants(org, "manager");
    await saveRoleGrants(org, "manager", { ...before, sensitive: ["orderPrices"] });
    expect((await sensitiveKeysFor(org, "manager")).orderPrices).toBe(true);
    expect((await sensitiveKeysFor(org, "manager")).paymentDetails).toBe(false);

    await saveRoleGrants(org, "manager", { ...before, sensitive: [] });
    expect((await sensitiveKeysFor(org, "manager")).orderPrices).toBe(false);
  });

  it("is per business: granting in one business changes nothing in another", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    await saveRoleGrants(a, "staff", { ...(await effectiveMatrixGrants(a, "staff")), sensitive: ["orderPrices", "menuPrices"] });
    expect(await heldBy(a, "staff")).toEqual(["menuPrices", "orderPrices"]);
    expect(await heldBy(b, "staff")).toEqual([]);
  });

  it("a saved grant list is cleaned: unknown keys are dropped and the owner role cannot be changed", async () => {
    const org = await makeOrg();
    const saved = await saveRoleGrants(org, "manager", { sensitive: ["orderPrices", "godMode"] });
    expect(saved.sensitive).toEqual(["orderPrices"]);
    await expect(saveRoleGrants(org, "owner", { sensitive: [] })).rejects.toThrow();
    expect(await heldBy(org, "owner")).toEqual([...SENSITIVE_KEYS].sort());
  });

  it("several roles on one member (Better Auth stores them comma-separated) hold the union of their keys", async () => {
    const org = await makeOrg();
    expect(await heldBy(org, "inventoryTeam,accounts")).toEqual(["commercialDocuments", "financialReports", "orderPrices", "paymentDetails", "supplierCosts"]);
    expect(await grantedActions(org, "kitchen,staff", "kitchen")).toEqual(["view", "updateStatus", "viewPdf"]);
  });
});

describe("older saved changes", () => {
  it("an override saved before the redesign (it lists only the old modules) keeps the new modules' defaults and grants no key", async () => {
    const org = await makeOrg();
    // The shape the old editor saved: only the twelve old modules, nothing for kitchen, recipes or sensitive.
    await prisma.rolePermissionOverride.create({ data: { organizationId: org, role: "kitchen", grants: { orders: ["view"], customers: [] } } });
    const overrides = await listRoleOverrides(org);
    expect(Object.keys(overrides.kitchen).sort()).toEqual(["customers", "orders"]);
    // Kitchen still works the dashboard and writes recipes (the new defaults), gains nothing sensitive, and the old change still applies.
    expect(await roleAllows(org, "kitchen", { kitchen: ["view", "updateStatus", "viewPdf"] })).toBe(true);
    expect(await roleAllows(org, "kitchen", { recipes: ["view", "create", "edit"] })).toBe(true);
    expect(await roleAllows(org, "kitchen", { orders: ["view"] })).toBe(true);
    expect(await heldBy(org, "kitchen")).toEqual([]);
  });

  it("an older override for a role that holds keys by default does not take them away either", async () => {
    const org = await makeOrg();
    await prisma.rolePermissionOverride.create({ data: { organizationId: org, role: "accounts", grants: { invoices: ["view"] } } });
    expect(await heldBy(org, "accounts")).toEqual(["commercialDocuments", "financialReports", "orderPrices", "paymentDetails"]);
  });
});
