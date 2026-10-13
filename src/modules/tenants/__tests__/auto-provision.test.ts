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

describe("provisionTenantForNewUser business mobile (2026-10-13)", () => {
  it("starts the business's contactPhone from the phone given at sign-up, and leaves it empty when there is none", async () => {
    const withPhone = await prisma.user.create({
      data: { id: crypto.randomUUID(), name: "Asha Rao", email: `owner-${crypto.randomUUID()}@example.test`, emailVerified: true, phone: "9800000012" },
    });
    const withoutPhone = await prisma.user.create({
      data: { id: crypto.randomUUID(), name: "No Phone", email: `owner-${crypto.randomUUID()}@example.test`, emailVerified: true },
    });
    cleanupUserIds.push(withPhone.id, withoutPhone.id);

    const a = await provisionTenantForNewUser(withPhone.id);
    const b = await provisionTenantForNewUser(withoutPhone.id);
    cleanupOrgIds.push(a.organizationId!, b.organizationId!);

    expect((await prisma.organization.findUniqueOrThrow({ where: { id: a.organizationId! } })).contactPhone).toBe("+919800000012");
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: b.organizationId! } })).contactPhone).toBeNull();
  });
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
