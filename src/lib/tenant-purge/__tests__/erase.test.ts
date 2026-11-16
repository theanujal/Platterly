import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ensureTrialPlan } from "@/modules/subscriptions/trial-plan";
import { eraseTenant } from "../erase";

const orgIds: string[] = [];
const userIds: string[] = [];
afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

const person = async (label: string) => {
  const u = await prisma.user.create({ data: { id: crypto.randomUUID(), name: label, email: `${label}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(u.id);
  return u;
};
const business = async (name: string) => {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name, slug: `erase-${crypto.randomUUID().slice(0, 8)}`, status: "SUSPENDED", createdAt: new Date() } });
  orgIds.push(org.id);
  return org;
};

describe("eraseTenant (final removal after an approved account deletion)", () => {
  it("removes the business, its audit trail, subscription and team people, and leaves everyone else alone", async () => {
    const owner = await person("owner");
    const shared = await person("shared");
    const org = await business("Erase Me");
    const other = await business("Keep Me");
    const bystander = await person("bystander");
    await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: owner.id, role: "owner", createdAt: new Date() } });
    await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: shared.id, role: "staff", createdAt: new Date() } });
    await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: other.id, userId: shared.id, role: "staff", createdAt: new Date() } });
    await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: other.id, userId: bystander.id, role: "owner", createdAt: new Date() } });
    const trial = await ensureTrialPlan();
    await prisma.subscription.create({ data: { organizationId: org.id, subscriptionPlanId: trial.id, status: "TRIALING" } });
    await prisma.auditLog.create({ data: { organizationId: org.id, actorUserId: owner.id, action: "test.erase", recordType: "Organization", recordId: org.id } });

    expect(await eraseTenant(org.id)).toEqual({ removed: true, people: 1 });
    expect(await prisma.organization.findUnique({ where: { id: org.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: owner.id } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await prisma.subscription.count({ where: { organizationId: org.id } })).toBe(0);
    // A person who also works in another business stays; the other business is untouched.
    expect(await prisma.user.findUnique({ where: { id: shared.id } })).not.toBeNull();
    expect(await prisma.organization.findUnique({ where: { id: other.id } })).not.toBeNull();
    expect(await prisma.member.count({ where: { organizationId: other.id } })).toBe(2);
    // Erasing again, or something that never existed, is a no-op.
    expect(await eraseTenant(org.id)).toEqual({ removed: false, people: 0 });
  });
});
