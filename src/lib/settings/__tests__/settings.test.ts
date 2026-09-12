import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings/settings";

const cleanupOrgIds: string[] = [];

afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  cleanupOrgIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Settings Test Org", slug: `settings-${crypto.randomUUID()}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  return org;
}

describe("tenant settings scaffold (Chunk 2 Group 2.5)", () => {
  it("returns null for a key that was never set", async () => {
    const org = await makeOrg();
    expect(await getSetting(org.id, "currency")).toBeNull();
  });

  it("round-trips a value through set then get", async () => {
    const org = await makeOrg();
    await setSetting(org.id, "currency", { code: "INR", symbol: "₹" });
    expect(await getSetting(org.id, "currency")).toEqual({ code: "INR", symbol: "₹" });
  });

  it("upserts on the (organizationId, key) unique constraint rather than erroring on a second write", async () => {
    const org = await makeOrg();
    await setSetting(org.id, "currency", { code: "INR" });
    await setSetting(org.id, "currency", { code: "SAR" });
    expect(await getSetting(org.id, "currency")).toEqual({ code: "SAR" });
  });

  it("keeps the same key isolated per organization", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    await setSetting(orgA.id, "currency", { code: "INR" });
    expect(await getSetting(orgB.id, "currency")).toBeNull();
  });
});
