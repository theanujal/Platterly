import "server-only";
import { prisma } from "@/lib/db";
import { lockMemberPair } from "@/lib/member-lock/with-member-lock";

/** True when the Platform already made this person a member of a business (so a brand-new Caterly user must not get a tenant of their own). */
export async function hasPendingMembership(subject: string): Promise<boolean> {
  return (await prisma.platformPendingMember.findUnique({ where: { subject }, select: { subject: true } })) !== null;
}

/**
 * At a person's first central sign-in (their account row has just been created): join the business the Platform made them a member of. Does nothing when
 * there is no pending row, the business is not linked here yet, or the person already belongs to a business here (the row stays for a human to settle).
 * Returns whether a membership was created.
 */
export async function consumePendingMembership(userId: string, subject: string): Promise<boolean> {
  const pending = await prisma.platformPendingMember.findUnique({ where: { subject } });
  if (!pending) return false;
  const org = await prisma.organization.findUnique({ where: { businessId: pending.businessId }, select: { id: true } });
  if (!org) return false;
  return prisma.$transaction(async (tx) => {
    await lockMemberPair(tx, userId, org.id);
    if (await tx.member.findFirst({ where: { userId }, select: { id: true } })) return false;
    await tx.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId, role: pending.role, createdAt: new Date(), disabledAt: pending.disabled ? new Date() : null } });
    await tx.platformPendingMember.delete({ where: { subject } });
    return true;
  });
}
