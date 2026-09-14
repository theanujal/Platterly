import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createMenuItem } from "@/modules/menus/item";
import { createPackage, updatePackage, deletePackage, getPackage, InvalidPackagePricingError } from "@/modules/menus/package";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuPackageItem.deleteMany({ where: { package: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.menuPackage.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuItem.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Package Test Org", slug: `pkg-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
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

describe("MenuPackage CRUD (Chunk 6 Group 6.1)", () => {
  it("createPackage rejects a FIXED package with no fixedPrice", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    await expect(
      createPackage(org.id, { name: "Bad Package", pricingModel: "FIXED", items: [] }, actor.id),
    ).rejects.toThrow(InvalidPackagePricingError);
  });

  it("createPackage rejects minGuests > maxGuests", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    await expect(
      createPackage(
        org.id,
        { name: "Bad Range", pricingModel: "PER_PERSON", perPersonPrice: 500, minGuests: 100, maxGuests: 10, items: [] },
        actor.id,
      ),
    ).rejects.toThrow(InvalidPackagePricingError);
  });

  it("createPackage stores included/optional/add-on items with their extraPrice", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const main = await createMenuItem(org.id, { name: "Main Course", isFoodProduct: true, price: 0 }, actor.id);
    const dessert = await createMenuItem(org.id, { name: "Premium Dessert", isFoodProduct: true, price: 0 }, actor.id);

    const pkg = await createPackage(
      org.id,
      {
        name: "Gold Package",
        pricingModel: "PER_PERSON",
        perPersonPrice: 500,
        minGuests: 20,
        maxGuests: 200,
        items: [
          { menuItemId: main.id },
          { menuItemId: dessert.id, isOptional: true, extraPrice: 75 },
        ],
      },
      actor.id,
    );

    const fetched = await getPackage(org.id, pkg.id);
    expect(fetched!.items).toHaveLength(2);
    const optionalItem = fetched!.items.find((i) => i.menuItemId === dessert.id);
    expect(optionalItem!.isOptional).toBe(true);
    expect(Number(optionalItem!.extraPrice)).toBe(75);
  });

  it("updatePackage switches pricing model and clears the now-irrelevant price field", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const pkg = await createPackage(org.id, { name: "Switching Package", pricingModel: "FIXED", fixedPrice: 10000, items: [] }, actor.id);

    const updated = await updatePackage(
      org.id,
      pkg.id,
      { name: "Switching Package", pricingModel: "PER_PERSON", perPersonPrice: 400, items: [] },
      actor.id,
    );

    expect(updated.pricingModel).toBe("PER_PERSON");
    expect(updated.fixedPrice).toBeNull();
    expect(Number(updated.perPersonPrice)).toBe(400);
  });

  it("deletePackage removes the package and its line items without deleting the underlying MenuItems", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createMenuItem(org.id, { name: "Survives", isFoodProduct: true, price: 0 }, actor.id);
    const pkg = await createPackage(org.id, { name: "Temp Package", pricingModel: "FIXED", fixedPrice: 5000, items: [{ menuItemId: item.id }] }, actor.id);

    await deletePackage(org.id, pkg.id, actor.id);

    expect(await getPackage(org.id, pkg.id)).toBeNull();
    expect(await prisma.menuItem.findUnique({ where: { id: item.id } })).not.toBeNull();
  });
});
