import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Exercises the `User.isSuperAdmin` condition requireSuperAdmin()
 * (src/lib/auth/require-session.ts) relies on. Full cookie-driven
 * login→dashboard flow testing is deferred to manual verification via
 * `npm run dev`, same precedent as tenant-isolation.test.ts — Better Auth's
 * `nextCookies` plugin ties `auth.api.*` calls to a live Next.js request
 * scope, which a plain Vitest test doesn't have.
 */

const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.member.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupUserIds.length = 0;
});

describe("Super Admin flag (Chunk 3 Group 3.1)", () => {
  it("a new user defaults to isSuperAdmin=false", async () => {
    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Regular User",
        email: `regular-${crypto.randomUUID()}@example.test`,
        emailVerified: true,
      },
    });
    cleanupUserIds.push(user.id);

    expect(user.isSuperAdmin).toBe(false);
  });

  it("a Super Admin user has isSuperAdmin=true and no Member row — the distinguishing condition requireSuperAdmin() checks", async () => {
    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Platform Admin",
        email: `admin-${crypto.randomUUID()}@example.test`,
        emailVerified: true,
        isSuperAdmin: true,
      },
    });
    cleanupUserIds.push(user.id);

    const memberships = await prisma.member.findMany({ where: { userId: user.id } });

    expect(user.isSuperAdmin).toBe(true);
    expect(memberships).toHaveLength(0);
  });
});
