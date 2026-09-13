import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";

export class CannotDisableOwnerError extends Error {}

/**
 * Chunk 5 Group 5.2 — Team Management. Mirrors `tenant.ts`'s style: plain
 * server-only functions, direct Prisma, no header plumbing (that's only
 * needed by the `auth.api.*` invitation calls, which live in `actions.ts`
 * where request headers are actually available).
 */
export async function listMembers(organizationId: string) {
  return prisma.member.findMany({
    where: { organizationId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Only pending, unexpired invitations — an expired-but-still-"pending"-status
 * row is shown as "Expired" in the UI rather than hidden, matching normal
 * invite-list UX. Read directly via Prisma (no header plumbing needed for a
 * pure read); `auth.api.listInvitations` would need the caller's headers
 * threaded through, which this header-less module deliberately avoids.
 */
export async function listPendingInvitations(organizationId: string) {
  return prisma.invitation.findMany({
    where: { organizationId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
}

export async function disableMember(organizationId: string, memberId: string, actorUserId: string) {
  const member = await prisma.member.findFirstOrThrow({ where: { id: memberId, organizationId } });
  if (member.role === "owner") {
    throw new CannotDisableOwnerError("An organization must always retain at least one enabled owner.");
  }

  const after = await prisma.member.update({ where: { id: memberId }, data: { disabledAt: new Date() } });

  await audit({
    organizationId,
    actorUserId,
    action: "team.member_disable",
    recordType: "Member",
    recordId: memberId,
    after: { disabledAt: after.disabledAt },
  });

  return after;
}

export async function enableMember(organizationId: string, memberId: string, actorUserId: string) {
  await prisma.member.findFirstOrThrow({ where: { id: memberId, organizationId } });

  const after = await prisma.member.update({ where: { id: memberId }, data: { disabledAt: null } });

  await audit({
    organizationId,
    actorUserId,
    action: "team.member_enable",
    recordType: "Member",
    recordId: memberId,
    after: { disabledAt: after.disabledAt },
  });

  return after;
}
