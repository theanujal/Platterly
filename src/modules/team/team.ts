import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { ValidationError } from "@/lib/errors";
import { getEntitlements, limitOf } from "@/modules/ops-link/entitlements";

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
    include: { user: true, location: { select: { id: true, name: true } } },
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

/**
 * Better Auth only sees *unexpired* invitations as "already invited", so
 * re-inviting an address whose old invite lapsed would leave the expired row
 * in the Pending list next to the new one. Retire the stale row first.
 */
export async function retireExpiredInvitations(organizationId: string, email: string) {
  await prisma.invitation.updateMany({
    where: { organizationId, email: { equals: email, mode: "insensitive" }, status: "pending", expiresAt: { lte: new Date() } },
    data: { status: "canceled" },
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

/**
 * Chunk 23 — the one location a team member works from. Null puts them back on the whole kitchen (open). The owner is
 * always kitchen-wide, and the location must belong to the same kitchen.
 */
export async function setMemberLocation(organizationId: string, memberId: string, locationId: string | null, actorUserId: string) {
  const member = await prisma.member.findFirst({ where: { id: memberId, organizationId } });
  if (!member) throw new ValidationError("That team member doesn't exist.");
  if (member.role === "owner") throw new ValidationError("The owner always works across every location.");
  if (locationId !== null) {
    const location = await prisma.kitchen.findFirst({ where: { id: locationId, organizationId }, select: { id: true } });
    if (!location) throw new ValidationError("That location doesn't exist.");
  }
  await prisma.member.update({ where: { id: memberId }, data: { locationId } });
  await audit({ organizationId, actorUserId, action: "team.member_location", recordType: "Member", recordId: memberId, before: { locationId: member.locationId }, after: { locationId } });
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

/**
 * Team seats: the plan's `maxUsers` (null = unlimited) against enabled
 * members plus invitations that could still be accepted — an unexpired
 * pending invite already holds a seat, so a full team can't over-invite.
 */
export async function getSeatUsage(organizationId: string) {
  const [members, pendingInvites, entitlements] = await Promise.all([
    prisma.member.count({ where: { organizationId, disabledAt: null } }),
    prisma.invitation.count({ where: { organizationId, status: "pending", expiresAt: { gt: new Date() } } }),
    getEntitlements(organizationId),
  ]);
  const limit = limitOf(entitlements, "maxUsers") ?? null;
  return { members, pendingInvites, limit, full: limit !== null && members + pendingInvites >= limit };
}

export interface TeamPrivacyView {
  allowTeamVisibility: boolean;
  showName: boolean;
  showEmail: boolean;
  showAvatar: boolean;
}

/**
 * What one member sees of another under the Privacy tab. Owners always see
 * everyone in full; a member always sees themselves in full. Otherwise
 * "Allow team visibility" off hides the person entirely, and each show-flag
 * blanks the matching field.
 */
export function applyTeamPrivacy<T extends { userId: string; role: string; user: { name: string; email: string; image: string | null } }>(
  members: T[],
  viewer: { userId: string; role: string },
  privacy: TeamPrivacyView,
): T[] {
  if (viewer.role === "owner") return members;
  return members
    .filter((m) => m.userId === viewer.userId || m.role === "owner" || privacy.allowTeamVisibility)
    .map((m) => {
      if (m.userId === viewer.userId || m.role === "owner") return m;
      return {
        ...m,
        user: {
          ...m.user,
          name: privacy.showName ? m.user.name : "Team member",
          email: privacy.showEmail ? m.user.email : "",
          image: privacy.showAvatar ? m.user.image : null,
        },
      };
    });
}
