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

describe("partial overrides: unlisted modules keep the preset, explicit denials hold", () => {
  const OLD_MODULES = ["orders", "quotations", "invoices", "payments", "customers", "eventTypes", "menus", "inventory", "expenses", "reports", "audit", "staffing"];
  // What the old editor saved: only the twelve old modules, with Orders view-only and everything else switched off.
  const legacyOverride = () => Object.fromEntries(OLD_MODULES.map((key) => [key, key === "orders" ? ["view"] : []]));

  it("an unlisted module falls back to the role's preset", async () => {
    const org = await makeOrg();
    await prisma.rolePermissionOverride.create({ data: { organizationId: org, role: "manager", grants: { orders: ["view"] } } });
    expect(await roleAllows(org, "manager", { orders: ["view"] })).toBe(true);
    // Customers is not listed, so the Manager keeps the preset create/edit there.
    expect(await roleAllows(org, "manager", { customers: ["view", "create", "edit"] })).toBe(true);
    expect(await roleAllows(org, "manager", { recipes: ["view", "create", "edit"] })).toBe(true);
  });

  it("an explicit denial overrides an enabled preset, for a module action and for a sensitive key", async () => {
    const org = await makeOrg();
    // The Manager's preset has orders create/edit; the override lists orders as view only, so they are denied.
    await saveRoleGrants(org, "manager", { ...(await effectiveMatrixGrants(org, "manager")), orders: ["view"] });
    expect(await roleAllows(org, "manager", { orders: ["view"] })).toBe(true);
    expect(await roleAllows(org, "manager", { orders: ["create"] })).toBe(false);
    expect(await roleAllows(org, "manager", { orders: ["edit"] })).toBe(false);
    // Accounts holds four keys by preset; an explicit empty list takes every one away, and a short list keeps only what it names.
    await saveRoleGrants(org, "accounts", { ...(await effectiveMatrixGrants(org, "accounts")), sensitive: [] });
    expect(await heldBy(org, "accounts")).toEqual([]);
    await saveRoleGrants(org, "accounts", { ...(await effectiveMatrixGrants(org, "accounts")), sensitive: ["paymentDetails"] });
    expect(await heldBy(org, "accounts")).toEqual(["paymentDetails"]);
  });

  it.each(["staff", "manager", "kitchen"])("a legacy partial override for %s applies what it lists and grants no sensitive key", async (role) => {
    const org = await makeOrg();
    const presetKitchen = await grantedActions(org, role, "kitchen");
    const presetRecipes = await grantedActions(org, role, "recipes");
    await prisma.rolePermissionOverride.create({ data: { organizationId: org, role, grants: legacyOverride() } });
    // The listed modules follow the override: Orders is view-only, everything else listed is off.
    expect(await grantedActions(org, role, "orders")).toEqual(["view"]);
    for (const key of OLD_MODULES.filter((k) => k !== "orders")) expect(await grantedActions(org, role, key), key).toEqual([]);
    // The modules the legacy override never knew about keep the preset, and no sensitive key appears.
    expect(await grantedActions(org, role, "kitchen")).toEqual(presetKitchen);
    expect(await grantedActions(org, role, "recipes")).toEqual(presetRecipes);
    expect(await heldBy(org, role)).toEqual([]);
  });

  it("a sensitive key written into another module's list, or a key only the preset names, is not honoured as a grant", async () => {
    const org = await makeOrg();
    await prisma.rolePermissionOverride.create({ data: { organizationId: org, role: "staff", grants: { orders: ["view", "orderPrices", "menuPrices"], quotations: ["view", "financialReports"] } } });
    expect(await heldBy(org, "staff")).toEqual([]);
    expect(await roleAllows(org, "staff", { sensitive: ["orderPrices"] })).toBe(false);
    // The effective view is cleaned the same way: only real actions of the module survive.
    expect((await effectiveMatrixGrants(org, "staff")).orders).toEqual(["view"]);
  });

  it("Kitchen access never implies Orders or Menu Catalog, by preset or after a legacy override", async () => {
    const org = await makeOrg();
    for (const wanted of [{ orders: ["view"] }, { menus: ["view"] }, { quotations: ["view"] }, { customers: ["view"] }]) {
      expect(await roleAllows(org, "kitchen", wanted), JSON.stringify(wanted)).toBe(false);
    }
    // A legacy override that lists nothing for Orders or Menus does not open them, and the kitchen work stays available.
    await prisma.rolePermissionOverride.create({ data: { organizationId: org, role: "kitchen", grants: { customers: [], staffing: ["view"] } } });
    for (const wanted of [{ orders: ["view"] }, { menus: ["view"] }]) expect(await roleAllows(org, "kitchen", wanted), JSON.stringify(wanted)).toBe(false);
    expect(await roleAllows(org, "kitchen", { kitchen: ["view", "updateStatus", "viewPdf"] })).toBe(true);
    expect(await heldBy(org, "kitchen")).toEqual([]);
  });
});
