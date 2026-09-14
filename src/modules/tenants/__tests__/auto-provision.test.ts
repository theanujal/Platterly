import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { provisionTenantForNewUser } from "@/modules/tenants/auto-provision";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.member.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

describe("provisionTenantForNewUser owner name population (Chunk 6 correction)", () => {
  it("copies the new user's firstName/lastName onto the Organization's ownerFirstName/ownerLastName", async () => {
    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Asha Rao",
        firstName: "Asha",
        lastName: "Rao",
        email: `owner-${crypto.randomUUID()}@example.test`,
        emailVerified: true,
      },
    });
    cleanupUserIds.push(user.id);

    const result = await provisionTenantForNewUser(user.id);
    expect(result.organizationId).not.toBeNull();
    cleanupOrgIds.push(result.organizationId!);

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: result.organizationId! } });
    expect(org.ownerFirstName).toBe("Asha");
    expect(org.ownerLastName).toBe("Rao");
  });

  it("leaves ownerFirstName/ownerLastName null when the user has no lastName", async () => {
    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Priya",
        firstName: "Priya",
        email: `owner-${crypto.randomUUID()}@example.test`,
        emailVerified: true,
      },
    });
    cleanupUserIds.push(user.id);

    const result = await provisionTenantForNewUser(user.id);
    cleanupOrgIds.push(result.organizationId!);

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: result.organizationId! } });
    expect(org.ownerFirstName).toBe("Priya");
    expect(org.ownerLastName).toBeNull();
  });
});
