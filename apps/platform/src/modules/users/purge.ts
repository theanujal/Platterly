import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { IDP_PROVIDER } from "../auth/config";

/**
 * Removes the Platform's copy of a person who never paid for a paid-plan sign-up (docs/paid-plan-signup-plan.md): the identity link, then the user. It does nothing,
 * and says so, when the person belongs to any business, so a person with a real business can never be removed by this. Returns whether anything was removed.
 */
export async function purgeUnattachedUser(prisma: Pick<PrismaClient, "$transaction">, subject: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const link = await tx.userIdentity.findFirst({ where: { provider: IDP_PROVIDER, subject }, select: { id: true, userId: true } });
    if (!link) return false;
    if ((await tx.organisationMember.count({ where: { userId: link.userId } })) > 0) return false;
    await tx.userIdentity.delete({ where: { id: link.id } });
    await tx.user.delete({ where: { id: link.userId } });
    return true;
  });
}
