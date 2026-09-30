import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { listMembers, listPendingInvitations, disableMember, enableMember, CannotDisableOwnerError, getSeatUsage, applyTeamPrivacy, retireExpiredInvitations } from "../team";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function seedOrgWithMembers() {
  const org = await prisma.organization.create({
    data: {
      id: crypto.randomUUID(),
      name: "Team Test Co",
      slug: `team-${crypto.randomUUID().slice(0, 8)}`,
      status: "ACTIVE",
      createdAt: new Date(),
    },
  });
  cleanupOrgIds.push(org.id);

  async function makeMember(role: string) {
    const user = await prisma.user.create({
      data: { id: crypto.randomUUID(), name: `${role} user`, email: `${role}-${crypto.randomUUID()}@example.test`, emailVerified: true },
    });
    cleanupUserIds.push(user.id);
    const member = await prisma.member.create({
      data: { id: crypto.randomUUID(), organizationId: org.id, userId: user.id, role, createdAt: new Date() },
    });
    return { user, member };
  }

  const owner = await makeMember("owner");
  const staff = await makeMember("staff");
  return { org, owner, staff };
}

describe("Team Management (Chunk 5 Group 5.2)", () => {
  it("listMembers returns every member of the org with user data included", async () => {
    const { org, owner, staff } = await seedOrgWithMembers();
    const members = await listMembers(org.id);
    expect(members.map((m) => m.userId).sort()).toEqual([owner.user.id, staff.user.id].sort());
    expect(members[0].user).toBeDefined();
  });

  it("listPendingInvitations returns only pending invitations for the org", async () => {
    const { org, owner } = await seedOrgWithMembers();
    await prisma.invitation.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: org.id,
        email: "pending@example.test",
        role: "staff",
        status: "pending",
        expiresAt: new Date(Date.now() + 86400000),
        inviterId: owner.user.id,
      },
    });
    await prisma.invitation.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: org.id,
        email: "accepted@example.test",
        role: "staff",
        status: "accepted",
        expiresAt: new Date(Date.now() + 86400000),
        inviterId: owner.user.id,
      },
    });

    const pending = await listPendingInvitations(org.id);
    expect(pending).toHaveLength(1);
    expect(pending[0].email).toBe("pending@example.test");
  });

  it("retireExpiredInvitations cancels only the expired pending invite for that email", async () => {
    const { org, owner } = await seedOrgWithMembers();
    const make = (email: string, expiresAt: Date) =>
      prisma.invitation.create({ data: { id: crypto.randomUUID(), organizationId: org.id, email, role: "staff", status: "pending", expiresAt, inviterId: owner.user.id } });
    await make("lapsed@example.test", new Date(Date.now() - 1000));
    await make("live@example.test", new Date(Date.now() + 3600_000));
    await make("other-lapsed@example.test", new Date(Date.now() - 1000));

    await retireExpiredInvitations(org.id, "Lapsed@Example.test");

    const pending = (await listPendingInvitations(org.id)).map((i) => i.email).sort();
    expect(pending).toEqual(["live@example.test", "other-lapsed@example.test"]);
  });

  it("disableMember sets disabledAt and writes an audit entry", async () => {
    const { org, owner, staff } = await seedOrgWithMembers();
    const disabled = await disableMember(org.id, staff.member.id, owner.user.id);
    expect(disabled.disabledAt).not.toBeNull();

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "team.member_disable" } });
    expect(log).not.toBeNull();
  });

  it("disableMember refuses to disable an owner", async () => {
    const { org, owner } = await seedOrgWithMembers();
    await expect(disableMember(org.id, owner.member.id, owner.user.id)).rejects.toThrow(CannotDisableOwnerError);
  });

  it("enableMember clears disabledAt", async () => {
    const { org, owner, staff } = await seedOrgWithMembers();
    await disableMember(org.id, staff.member.id, owner.user.id);
    const enabled = await enableMember(org.id, staff.member.id, owner.user.id);
    expect(enabled.disabledAt).toBeNull();
  });

  it("getSeatUsage counts enabled members plus live invitations against the plan's maxUsers", async () => {
    const { org, owner, staff } = await seedOrgWithMembers();
    const plan = await prisma.subscriptionPlan.create({
      data: { code: `seat-test-${crypto.randomUUID().slice(0, 8)}`, name: "Seat test", maxUsers: 3 },
    });
    await prisma.subscription.create({ data: { organizationId: org.id, subscriptionPlanId: plan.id, status: "ACTIVE" } });
    try {
      let usage = await getSeatUsage(org.id);
      expect(usage).toMatchObject({ members: 2, pendingInvites: 0, limit: 3, full: false });

      await prisma.invitation.create({
        data: { id: crypto.randomUUID(), organizationId: org.id, email: "live@example.test", role: "staff", status: "pending", expiresAt: new Date(Date.now() + 3600_000), inviterId: owner.user.id },
      });
      // An expired invite no longer holds a seat.
      await prisma.invitation.create({
        data: { id: crypto.randomUUID(), organizationId: org.id, email: "old@example.test", role: "staff", status: "pending", expiresAt: new Date(Date.now() - 3600_000), inviterId: owner.user.id },
      });
      usage = await getSeatUsage(org.id);
      expect(usage).toMatchObject({ members: 2, pendingInvites: 1, full: true });

      // A disabled member frees their seat.
      await disableMember(org.id, staff.member.id, owner.user.id);
      usage = await getSeatUsage(org.id);
      expect(usage).toMatchObject({ members: 1, pendingInvites: 1, full: false });
    } finally {
      await prisma.subscription.deleteMany({ where: { subscriptionPlanId: plan.id } });
      await prisma.subscriptionPlan.delete({ where: { id: plan.id } });
    }
  });

  it("getSeatUsage treats a plan without maxUsers as unlimited", async () => {
    const { org } = await seedOrgWithMembers();
    const usage = await getSeatUsage(org.id);
    expect(usage.limit).toBeNull();
    expect(usage.full).toBe(false);
  });
});

describe("applyTeamPrivacy", () => {
  const person = (userId: string, role: string) => ({ userId, role, user: { name: `Name ${userId}`, email: `${userId}@x.test`, image: "img" as string | null } });
  const members = [person("o", "owner"), person("m", "manager"), person("s", "staff")];
  const open = { allowTeamVisibility: true, showName: true, showEmail: true, showAvatar: true };

  it("owners always see everyone in full, whatever the settings", () => {
    const hidden = { allowTeamVisibility: false, showName: false, showEmail: false, showAvatar: false };
    expect(applyTeamPrivacy(members, { userId: "o", role: "owner" }, hidden)).toEqual(members);
  });

  it("with visibility off, a non-owner sees only themselves and the owner", () => {
    const result = applyTeamPrivacy(members, { userId: "m", role: "manager" }, { ...open, allowTeamVisibility: false });
    expect(result.map((m) => m.userId)).toEqual(["o", "m"]);
  });

  it("blanks name, email and avatar of other non-owner members per flag, but never the viewer's own", () => {
    const result = applyTeamPrivacy(members, { userId: "m", role: "manager" }, { ...open, showName: false, showEmail: false, showAvatar: false });
    const self = result.find((m) => m.userId === "m")!;
    const other = result.find((m) => m.userId === "s")!;
    expect(self.user.email).toBe("m@x.test");
    expect(other.user).toEqual({ name: "Team member", email: "", image: null });
  });
});
