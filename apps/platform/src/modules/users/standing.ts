import type { Prisma } from "@/generated/prisma/client";

// F3.2.2: the one read other modules need from the identity tables (the identity static guard keeps them out of `users` itself).
// It never changes a user. `emailVerified` is true only when the user row carries `email_verified_at`, which the identity-link service sets
// only from a trusted assertion.
export type UserStanding = { id: string; status: string; emailVerified: boolean };

export async function getUserStanding(tx: Pick<Prisma.TransactionClient, "user">, userId: string): Promise<UserStanding | null> {
  const row = await tx.user.findUnique({ where: { id: userId }, select: { id: true, status: true, emailVerifiedAt: true } });
  return row === null ? null : { id: row.id, status: row.status, emailVerified: row.emailVerifiedAt !== null };
}

export type AccountUser = { id: string; email: string; status: string; emailVerified: boolean };

/** What the Account profile shows about the signed-in person. Read-only; the users table holds no name, phone, time zone or language. */
export async function getAccountUser(tx: Pick<Prisma.TransactionClient, "user">, userId: string): Promise<AccountUser | null> {
  const row = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, status: true, emailVerifiedAt: true } });
  return row === null ? null : { id: row.id, email: row.email, status: row.status, emailVerified: row.emailVerifiedAt !== null };
}

/** The id of the Platform user whose sign-in email is exactly this, or null. Read-only; the Caterly business import uses it to find a business owner's person. */
export async function findUserIdByEmail(tx: Pick<Prisma.TransactionClient, "user">, email: string): Promise<string | null> {
  const row = await tx.user.findFirst({ where: { email }, select: { id: true } });
  return row?.id ?? null;
}
