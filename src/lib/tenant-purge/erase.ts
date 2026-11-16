import "server-only";
import { prisma } from "@/lib/db";

/**
 * The final removal of a business, sent by Ops (`business.erase`) after an approved account deletion's retention period. Irreversible, unlike the "Delete All
 * Data" purge (which keeps the organisation, its team and its billing history).
 *
 * Everything tenant-scoped goes with the Organization row (they all cascade from it). What does not cascade is removed first: the audit trail (it holds names and
 * values), the subscription copy and its payments, and the organisation's team people. A person is deleted only when this was their one organisation (their sessions,
 * sign-in accounts and notifications cascade from the person); a super admin is never touched. Returns what it removed, for the audit line Ops keeps.
 */
export async function eraseTenant(organizationId: string): Promise<{ removed: boolean; people: number }> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) return { removed: false, people: 0 };
  return prisma.$transaction(async (tx) => {
    const members = await tx.member.findMany({ where: { organizationId }, select: { userId: true } });
    const userIds = [...new Set(members.map((m) => m.userId))];
    const elsewhere = await tx.member.findMany({ where: { userId: { in: userIds }, organizationId: { not: organizationId } }, select: { userId: true } });
    const keep = new Set(elsewhere.map((m) => m.userId));
    const supers = await tx.user.findMany({ where: { id: { in: userIds }, isSuperAdmin: true }, select: { id: true } });
    for (const s of supers) keep.add(s.id);
    const doomed = userIds.filter((id) => !keep.has(id));

    await tx.auditLog.deleteMany({ where: { OR: [{ organizationId }, { actorUserId: { in: doomed } }] } });
    await tx.subscriptionPayment.deleteMany({ where: { organizationId } });
    await tx.subscription.deleteMany({ where: { organizationId } });
    await tx.organization.delete({ where: { id: organizationId } });
    await tx.user.deleteMany({ where: { id: { in: doomed } } });
    return { removed: true, people: doomed.length };
  });
}
