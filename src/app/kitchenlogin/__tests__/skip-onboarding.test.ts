import { describe, it, expect, afterEach, vi } from "vitest";

// "Skip for now" needs the mobile number: every WhatsApp goes to it (Sharath, 2026-10-23).
const who = vi.hoisted(() => ({ organizationId: "", userId: "" }));
vi.mock("@/lib/auth/require-session", () => ({
  requireActiveOrganization: async () => ({ session: { user: { id: who.userId } }, organizationId: who.organizationId }),
  requirePermission: async () => undefined,
  hasPermission: async () => true,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

import { prisma } from "@/lib/db";
import { skipOnboardingAction } from "../actions";

const orgIds: string[] = [];
const userIds: string[] = [];
afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = userIds.length = 0;
});

async function world() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Skip Co", slug: `skip-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `skip-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(user.id);
  await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: user.id, role: "owner", createdAt: new Date() } });
  who.organizationId = org.id;
  who.userId = user.id;
  return org;
}

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

describe("skipOnboardingAction", () => {
  it("refuses to skip without a valid mobile number and saves nothing", async () => {
    const org = await world();
    expect(await skipOnboardingAction(form({ businessName: "Renamed", mobileNumber: "" }))).toEqual({ ok: false, error: "Enter a valid mobile number to skip for now." });
    expect(await skipOnboardingAction(form({ businessName: "Renamed", mobileNumber: "12" }))).toMatchObject({ ok: false });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).name).toBe("Skip Co");
  });

  it("skips with a valid mobile number and saves it", async () => {
    const org = await world();
    expect(await skipOnboardingAction(form({ businessName: "Skip Co", mobileNumber: "+919812345678" }))).toMatchObject({ ok: true });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).contactPhone).toBe("+919812345678");
  });
});
