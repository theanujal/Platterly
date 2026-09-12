import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";

const createdOrgIds: string[] = [];

afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
  createdOrgIds.length = 0;
});

describe("Branch/Kitchen/Store hierarchy (PRD §47)", () => {
  it("carries organizationId on every level and cascades correctly", async () => {
    const org = await prisma.organization.create({
      data: {
        id: crypto.randomUUID(),
        name: "Test Caterer",
        slug: `test-caterer-${crypto.randomUUID()}`,
        createdAt: new Date(),
      },
    });
    createdOrgIds.push(org.id);

    const branch = await prisma.branch.create({
      data: { organizationId: org.id, name: "HQ", isDefault: true },
    });
    expect(branch.organizationId).toBe(org.id);

    const kitchen = await prisma.kitchen.create({
      data: { organizationId: org.id, branchId: branch.id, name: "Main Kitchen", isDefault: true },
    });
    const store = await prisma.store.create({
      data: { organizationId: org.id, branchId: branch.id, name: "Main Store", isDefault: true },
    });

    // Every row is directly tenant-scoped, not just reachable via a join
    // through Branch — this is what lets tenant-isolation queries filter on
    // organizationId alone (PRD §54-55).
    expect(kitchen.organizationId).toBe(org.id);
    expect(store.organizationId).toBe(org.id);

    // Deleting the organization cascades all the way down.
    await prisma.organization.delete({ where: { id: org.id } });
    createdOrgIds.length = 0;

    expect(await prisma.branch.findUnique({ where: { id: branch.id } })).toBeNull();
    expect(await prisma.kitchen.findUnique({ where: { id: kitchen.id } })).toBeNull();
    expect(await prisma.store.findUnique({ where: { id: store.id } })).toBeNull();
  });
});
