import { describe, it, expect, afterEach, vi } from "vitest";

// Issue 78: a teammate removed from the kitchen is locked out at once, not when their session happens to end.
// The signed-in session is stubbed; the membership lookup and the session rows are real.
const signedIn = vi.hoisted(() => ({ userId: "", activeOrganizationId: "" as string | null }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: signedIn.userId }, session: { activeOrganizationId: signedIn.activeOrganizationId } }) } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new Error("forbidden");
  },
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("@/modules/ops-link/entitlements", () => ({ isLocked: async () => false }));

import { prisma } from "@/lib/db";
import { requireActiveOrganization, requireOrg } from "../require-session";
import { removeMember } from "@/modules/team/team";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = userIds.length = 0;
});

async function kitchen() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Removed Member Co", slug: `rm-${crypto.randomUUID().slice(0, 8)}`, status: "ACTIVE", createdAt: new Date() } });
  orgIds.push(org.id);
  const person = async (role: string) => {
    const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: role, email: `${role}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
    userIds.push(user.id);
    const member = await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: user.id, role, createdAt: new Date() } });
    return { user, member };
  };
  return { org, owner: await person("owner"), staff: await person("manager") };
}

const session = (userId: string, activeOrganizationId: string | null) =>
  prisma.session.create({ data: { id: crypto.randomUUID(), token: crypto.randomUUID(), userId, activeOrganizationId, expiresAt: new Date(Date.now() + 86_400_000) } });

describe("a removed teammate (issue 78)", () => {
  it("is refused by both session helpers once their membership is gone", async () => {
    const { org, staff } = await kitchen();
    signedIn.userId = staff.user.id;
    signedIn.activeOrganizationId = org.id;
    await expect(requireActiveOrganization()).resolves.toMatchObject({ organizationId: org.id });
    await prisma.member.delete({ where: { id: staff.member.id } });
    await expect(requireActiveOrganization()).rejects.toThrow("forbidden");
    await expect(requireOrg(org.id)).rejects.toThrow("forbidden");
  });

  it("is signed out of this kitchen's sessions when removed; a session in another kitchen stays", async () => {
    const { org, owner, staff } = await kitchen();
    const here = await session(staff.user.id, org.id);
    const elsewhere = await session(staff.user.id, crypto.randomUUID());
    await removeMember(org.id, staff.member.id, owner.user.id);
    expect(await prisma.session.findUnique({ where: { id: here.id } })).toBeNull();
    expect(await prisma.session.findUnique({ where: { id: elsewhere.id } })).not.toBeNull();
  });
});
