import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createAddOn, updateAddOn, deleteAddOn, listAddOns, getAddOn } from "@/modules/addons/addon";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.addOn.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
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
