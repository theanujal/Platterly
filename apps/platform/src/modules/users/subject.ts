import type { Prisma } from "@/generated/prisma/client";

/**
 * The identity provider's person id (the sign-in's `sub`) for a Platform user: the oldest linked identity, or null when the person has none. Read-only. It lives
 * here because only the users module may touch the identity tables (identity-link.guard.test.ts); the outbox sender calls it to add `subject` to membership events.
 */
export async function findSubjectForUser(db: Pick<Prisma.TransactionClient, "userIdentity">, userId: string): Promise<string | null> {
  return (await db.userIdentity.findFirst({ where: { userId }, select: { subject: true }, orderBy: { createdAt: "asc" } }))?.subject ?? null;
}
