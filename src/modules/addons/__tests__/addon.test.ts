import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createAddOn, updateAddOn, deleteAddOn, listAddOns, getAddOn, duplicateAddOn, addOnOfferedOnMenu } from "@/modules/addons/addon";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.addOn.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menu.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "AddOn Test Org", slug: `addon-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  return org;
}

async function makeActor() {
  const actor = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: "Owner", email: `owner-${crypto.randomUUID()}@example.test`, emailVerified: true },
  });
  cleanupUserIds.push(actor.id);
  return actor;
}

describe("AddOn CRUD (Add-ons Management, 2026-09-14)", () => {
  it("createAddOn stores a Live Counter priced Per Plate, defaults isActive to true, and writes an AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const addOn = await createAddOn(
      org.id,
      { name: "Live Chaat Counter", type: "LIVE_COUNTER", priceType: "PER_PLATE", price: 150 },
      actor.id,
    );
    expect(addOn.type).toBe("LIVE_COUNTER");
    expect(addOn.priceType).toBe("PER_PLATE");
    expect(Number(addOn.price)).toBe(150);
    expect(addOn.isActive).toBe(true);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "add_on.create", recordId: addOn.id } });
    expect(log).not.toBeNull();
  });

  it("createAddOn stores a Special Add-on priced Fixed, and can be created inactive", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const addOn = await createAddOn(
      org.id,
      { name: "Custom Cake Topper", type: "SPECIAL_ADD_ON", priceType: "FIXED", price: 500, isActive: false },
      actor.id,
    );
    expect(addOn.type).toBe("SPECIAL_ADD_ON");
    expect(addOn.priceType).toBe("FIXED");
    expect(addOn.isActive).toBe(false);
  });

  it("updateAddOn changes fields, toggles isActive, and writes a before/after AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const addOn = await createAddOn(org.id, { name: "Live Dosa Counter", type: "LIVE_COUNTER", priceType: "PER_PLATE", price: 120 }, actor.id);

    const updated = await updateAddOn(
      org.id,
      addOn.id,
      { name: "Live Dosa Counter", type: "LIVE_COUNTER", priceType: "FIXED", price: 5000, isActive: false },
      actor.id,
    );
    expect(updated.priceType).toBe("FIXED");
    expect(Number(updated.price)).toBe(5000);
    expect(updated.isActive).toBe(false);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "add_on.update", recordId: addOn.id } });
    expect(log).not.toBeNull();
    expect((log!.before as { priceType: string }).priceType).toBe("PER_PLATE");
  });

  it("deleteAddOn hard-deletes the row and writes an AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const addOn = await createAddOn(org.id, { name: "Live Counter", type: "LIVE_COUNTER", priceType: "PER_PLATE", price: 100 }, actor.id);

    await deleteAddOn(org.id, addOn.id, actor.id);

    const stillExists = await prisma.addOn.findUnique({ where: { id: addOn.id } });
    expect(stillExists).toBeNull();
    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "add_on.delete", recordId: addOn.id } });
    expect(log).not.toBeNull();
  });

  it("listAddOns orders by name and is tenant-isolated; getAddOn is tenant-isolated", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    await createAddOn(orgA.id, { name: "Zesty Counter", type: "LIVE_COUNTER", priceType: "PER_PLATE", price: 100 }, actor.id);
    const first = await createAddOn(orgA.id, { name: "Ambient Lighting", type: "SPECIAL_ADD_ON", priceType: "FIXED", price: 2000 }, actor.id);
    await createAddOn(orgB.id, { name: "Other Tenant's Add-on", type: "LIVE_COUNTER", priceType: "PER_PLATE", price: 100 }, actor.id);

    const list = await listAddOns(orgA.id);
    expect(list.map((a) => a.name)).toEqual(["Ambient Lighting", "Zesty Counter"]);

    expect(await getAddOn(orgA.id, first.id)).not.toBeNull();
    expect(await getAddOn(orgB.id, first.id)).toBeNull();
  });
});

describe("AddOn <-> Menu scope (2026-10-13)", () => {
  async function makeMenu(organizationId: string, name: string) {
    return prisma.menu.create({ data: { organizationId, name, menuType: "VEGETARIAN", pricePerPlate: 500 } });
  }
  const base = { name: "Live Dosa", type: "LIVE_COUNTER", priceType: "PER_PLATE", price: 100 } as const;

  it("defaults to every menu and stores no menu rows", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const addOn = await createAddOn(org.id, base, actor.id);
    expect(addOn.appliesToAllMenus).toBe(true);
    const listed = await getAddOn(org.id, addOn.id);
    expect(listed?.menus).toEqual([]);
    expect(addOnOfferedOnMenu(listed!, "any-menu")).toBe(true);
    expect(addOnOfferedOnMenu(listed!, null)).toBe(true);
  });

  it("with specific menus, only those menus (never a Custom Menu) offer it", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const gold = await makeMenu(org.id, "Gold");
    const silver = await makeMenu(org.id, "Silver");
    const addOn = await createAddOn(org.id, { ...base, appliesToAllMenus: false, menuIds: [gold.id] }, actor.id);
    const listed = (await getAddOn(org.id, addOn.id))!;
    expect(addOnOfferedOnMenu(listed, gold.id)).toBe(true);
    expect(addOnOfferedOnMenu(listed, silver.id)).toBe(false);
    expect(addOnOfferedOnMenu(listed, null)).toBe(false);
  });

  it("refuses an add-on with no menus and All menus off", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    await expect(createAddOn(org.id, { ...base, appliesToAllMenus: false, menuIds: [] }, actor.id)).rejects.toThrow(/at least one menu/);
  });

  it("ignores menus from another business", async () => {
    const org = await makeOrg();
    const other = await makeOrg();
    const actor = await makeActor();
    const theirs = await makeMenu(other.id, "Theirs");
    const mine = await makeMenu(org.id, "Mine");
    const addOn = await createAddOn(org.id, { ...base, appliesToAllMenus: false, menuIds: [mine.id, theirs.id] }, actor.id);
    expect((await getAddOn(org.id, addOn.id))!.menus.map((m) => m.menuId)).toEqual([mine.id]);
  });

  it("update replaces the menus, switching to All menus clears them, and an update without menu fields keeps them", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const gold = await makeMenu(org.id, "Gold");
    const silver = await makeMenu(org.id, "Silver");
    const addOn = await createAddOn(org.id, { ...base, appliesToAllMenus: false, menuIds: [gold.id] }, actor.id);

    await updateAddOn(org.id, addOn.id, { ...base, appliesToAllMenus: false, menuIds: [silver.id] }, actor.id);
    expect((await getAddOn(org.id, addOn.id))!.menus.map((m) => m.menuId)).toEqual([silver.id]);

    await updateAddOn(org.id, addOn.id, { ...base, price: 120 }, actor.id);
    const kept = (await getAddOn(org.id, addOn.id))!;
    expect(kept.appliesToAllMenus).toBe(false);
    expect(kept.menus.map((m) => m.menuId)).toEqual([silver.id]);

    await updateAddOn(org.id, addOn.id, { ...base, appliesToAllMenus: true }, actor.id);
    const all = (await getAddOn(org.id, addOn.id))!;
    expect(all.appliesToAllMenus).toBe(true);
    expect(all.menus).toEqual([]);
  });

  it("duplicate copies the menus, and deleting a menu drops it from the add-on", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const gold = await makeMenu(org.id, "Gold");
    const silver = await makeMenu(org.id, "Silver");
    const addOn = await createAddOn(org.id, { ...base, appliesToAllMenus: false, menuIds: [gold.id, silver.id] }, actor.id);
    const copy = await duplicateAddOn(org.id, addOn.id, actor.id);
    expect((await getAddOn(org.id, copy.id))!.menus.map((m) => m.menuId).sort()).toEqual([gold.id, silver.id].sort());

    await prisma.menu.delete({ where: { id: gold.id } });
    expect((await getAddOn(org.id, addOn.id))!.menus.map((m) => m.menuId)).toEqual([silver.id]);
  });
});
