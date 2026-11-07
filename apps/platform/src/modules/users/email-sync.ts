import "server-only";
import { prisma } from "@/lib/db";
import type { Sync } from "../account/email-change";

// The Platform keeps its own copy of a person's sign-in email (its `users` table, linked to the identity provider's person by subject). When the
// email changes, that copy changes in the same step. A person with no Platform user yet has nothing to change. A Platform user that already holds the
// new address makes this throw, which rolls the identity change back.
export const platformEmailSync: Sync = async ({ userId, from, to }) => {
  const link = await prisma.userIdentity.findFirst({ where: { subject: userId }, select: { userId: true } });
  if (!link) return;
  const result = await prisma.user.updateMany({ where: { id: link.userId, email: from }, data: { email: to } });
  if (result.count !== 1) throw new Error("the Platform copy of the email did not match");
};

export async function platformEmailTaken(email: string, exceptPlatformUserId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return row !== null && row.id !== exceptPlatformUserId;
}

/** The Platform user id for an identity-provider person (by subject), or null when the person has no Platform user yet. */
export async function platformUserIdForSubject(subject: string): Promise<string | null> {
  const link = await prisma.userIdentity.findFirst({ where: { subject }, select: { userId: true } });
  return link?.userId ?? null;
}
