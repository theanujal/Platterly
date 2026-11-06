import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

// Test fixture for other modules' database tests (the identity static guard allows direct user access only here, under modules/users/).
// Callers create users inside a transaction they roll back.
export async function createTestUser(tx: Pick<Prisma.TransactionClient, "user">, opts: { verified?: boolean; status?: "active" | "disabled" } = {}): Promise<string> {
  const row = await tx.user.create({
    data: { email: `svc-${randomUUID()}@fixture.invalid`, status: opts.status ?? "active", emailVerifiedAt: opts.verified === false ? null : new Date() },
    select: { id: true },
  });
  return row.id;
}

export const countUsers = (db: Pick<Prisma.TransactionClient, "user">): Promise<number> => db.user.count();

/** Test-database cleanup and lookups for the F4 tests (direct user access is allowed only under modules/users/). */
export async function removeAllTestUsers(db: Pick<Prisma.TransactionClient, "user" | "userIdentity">): Promise<void> {
  await db.userIdentity.deleteMany({});
  await db.user.deleteMany({});
}
export const findUserWithIdentities = (db: Pick<Prisma.TransactionClient, "user">, email: string) =>
  db.user.findUnique({ where: { email }, include: { identities: true } });
export const insertUser = (db: Pick<Prisma.TransactionClient, "user">, data: { email: string; status?: "active" | "disabled" }) =>
  db.user.create({ data: { email: data.email, status: data.status ?? "active", emailVerifiedAt: new Date() }, select: { id: true } });
export const setUserStatus = (db: Pick<Prisma.TransactionClient, "user">, email: string, status: "active" | "disabled") => db.user.update({ where: { email }, data: { status } });
