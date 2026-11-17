import "server-only";
import type { PersonProfileData } from "@platterly/platform-contract";
import type { Prisma } from "@/generated/prisma/client";
import { PLATFORM_PROVIDER_ID } from "@/lib/platform/config";

/**
 * `person.profile`: the Account is the source of truth for a person's common details, so Caterly's copy follows. The Caterly user is found by the account
 * row the sign-in link stored (provider "platterly", account id = the Account's person id), never by email. The same rules as the refresh at sign-in:
 *  - an empty value never erases what Caterly has (an empty phone is "none on file", not "remove it");
 *  - if another Caterly user already holds the new email, this person keeps their current Caterly email (the unique email would otherwise refuse the
 *    whole update); names and phone still follow, and the email follows with the next change once the clash is gone;
 *  - the Account only sends addresses it has verified by code, so a changed email is marked verified here.
 * A person who has no Caterly user yet changes nothing: they get the details at their first sign-in.
 */
export async function applyPersonProfile(tx: Pick<Prisma.TransactionClient, "account" | "user">, data: PersonProfileData): Promise<{ changed: boolean }> {
  const link = await tx.account.findFirst({ where: { providerId: PLATFORM_PROVIDER_ID, accountId: data.subject }, select: { userId: true, user: { select: { email: true, phone: true } } } });
  if (!link) return { changed: false };

  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();
  const update: Prisma.UserUpdateInput = {};
  if (firstName && lastName) Object.assign(update, { firstName, lastName, name: `${firstName} ${lastName}`.trim() });
  if (data.phone.trim()) update.phone = data.phone.trim();
  // The photo: an empty value means the person removed it (the screens treat "" as no photo, as at sign-in); absent means the Platform did not say.
  if (data.picture !== undefined) update.image = data.picture;

  const email = data.email.trim().toLowerCase();
  if (email && email !== link.user.email.toLowerCase()) {
    const taken = await tx.user.findFirst({ where: { email, NOT: { id: link.userId } }, select: { id: true } });
    if (!taken) Object.assign(update, { email, emailVerified: true });
  }
  if (Object.keys(update).length === 0) return { changed: false };
  await tx.user.update({ where: { id: link.userId }, data: update });
  return { changed: true };
}
