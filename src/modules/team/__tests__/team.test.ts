import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { listMembers, listPendingInvitations, disableMember, enableMember, CannotDisableOwnerError } from "../team";

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
});
