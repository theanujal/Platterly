import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Exercises the same `findMemberByOrgId`-shaped query Better Auth's own
 * organization adapter uses (see has-permission.mjs / crud-members.mjs) —
 * this is the actual mechanism `requireOrg()`/`requirePermission()`
 * (src/lib/auth/require-session.ts) rely on to reject cross-tenant access.
 * A full sign-in-based end-to-end test (real cookies through requireSession)
 * is deferred to Chunk 4/5 once real login UI exists to drive it — Better
 * Auth's `nextCookies` plugin ties `auth.api.*` calls to a live Next.js
 * request scope, which a plain Vitest test doesn't have.
 */

const cleanupUserIds: string[] = [];
const cleanupOrgIds: string[] = [];

afterEach(async () => {
  await prisma.member.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupUserIds.length = 0;
  cleanupOrgIds.length = 0;
});

describe("Tenant isolation via organization membership (PRD §54-55)", () => {
  it("a user who is a member of Org A is never found as a member of Org B", async () => {
    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({
        data: { id: crypto.randomUUID(), name: "Org A", slug: `org-a-${crypto.randomUUID()}`, createdAt: new Date() },
      }),
      prisma.organization.create({
        data: { id: crypto.randomUUID(), name: "Org B", slug: `org-b-${crypto.randomUUID()}`, createdAt: new Date() },
      }),
    ]);
    cleanupOrgIds.push(orgA.id, orgB.id);

    const userA = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "User A",
        email: `user-a-${crypto.randomUUID()}@example.test`,
        emailVerified: true,
      },
    });
    cleanupUserIds.push(userA.id);

    await prisma.member.create({
      data: { id: crypto.randomUUID(), organizationId: orgA.id, userId: userA.id, role: "owner", createdAt: new Date() },
    });

    const membershipInOwnOrg = await prisma.member.findFirst({
      where: { userId: userA.id, organizationId: orgA.id },
    });
    const membershipInOtherOrg = await prisma.member.findFirst({
      where: { userId: userA.id, organizationId: orgB.id },
    });

    expect(membershipInOwnOrg).not.toBeNull();
    expect(membershipInOtherOrg).toBeNull();
  });
});
