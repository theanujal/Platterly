import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Permanent erasure of the Platform's own record of a person, inside the caller's transaction (docs/data-safety.md; the account erase in modules/account/erase.ts calls
 * this after the business is gone). Every identity link for the subject goes, with the person's legacy mappings and the user row. It lives in the users module because
 * only that module may touch these tables (identity-link.guard.test.ts). Safe to run again: with no link left it does nothing.
 */
export async function erasePersonRecords(tx: Prisma.TransactionClient, identitySubject: string): Promise<void> {
  const people = await tx.$queryRaw<{ user_id: string }[]>`select user_id from user_identities where subject = ${identitySubject}`;
  for (const { user_id } of people) {
    await tx.$executeRaw`delete from legacy_mappings where user_id = ${user_id}::uuid`;
    await tx.$executeRaw`delete from user_identities where user_id = ${user_id}::uuid`;
    await tx.$executeRaw`delete from users where id = ${user_id}::uuid`;
  }
}
