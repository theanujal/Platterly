import { prisma } from "@/lib/db";
import { platformUserIdForSubject } from "../users/email-sync";
import { identityPool } from "../auth/identity-db";
import { getProfile } from "../account/profile";
import { accountOrigin } from "../auth/config";
import { photoLinkUrl } from "../account/photo-link";
import { enqueueOutbox } from "./enqueue";

export type PersonProfile = { firstName: string; lastName: string; phone: string; email: string; picture?: string };

/**
 * Queues `person.profile` for every product the person holds a seat in (one event per seat, each in its own transaction with its own business
 * sequence). The Account's details live in the identity database, a different one, so this cannot share a transaction with the profile save: it runs after
 * it, and a failure here is for the caller to log. The product also refreshes at the person's next sign-in, so a missed event is late, not lost for good.
 * Returns how many events were queued; a person with no Platform user or no seat queues nothing.
 */
export async function emitPersonProfile(subject: string, profile: PersonProfile): Promise<number> {
  const userId = await platformUserIdForSubject(subject);
  if (!userId) return 0;
  const seats = await prisma.membershipProductSlot.findMany({ where: { userId }, select: { organisationId: true, productKey: true }, orderBy: [{ organisationId: "asc" }, { productKey: "asc" }] });
  for (const seat of seats) {
    await prisma.$transaction((tx) =>
      enqueueOutbox(tx, {
        organisationId: seat.organisationId,
        productKey: seat.productKey,
        eventType: "person.profile",
        payload: { userId, subject, firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone, email: profile.email, ...(profile.picture !== undefined ? { picture: profile.picture } : {}) },
      }),
    );
  }
  return seats.length;
}

/**
 * For the routes, after a change has been saved: reads the person's CURRENT details (so the event is never stale) and queues them. It never lets a
 * queueing failure turn a saved change into an error for the person. A person with no name on file is skipped (the contract needs one).
 */
export async function emitCurrentPersonProfile(subject: string): Promise<void> {
  try {
    const profile = await getProfile(identityPool(), subject);
    if (!profile || !profile.firstName.trim() || !profile.lastName.trim()) return;
    // The photo goes as a signed address, or "" when there is none (so a removal reaches the products); left out when there is no secret to sign with.
    const picture = profile.photoVersion ? photoLinkUrl(accountOrigin(), subject, profile.photoVersion) ?? undefined : "";
    await emitPersonProfile(subject, { firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone, email: profile.email, ...(picture !== undefined ? { picture } : {}) });
  } catch (error) {
    console.error("person.profile was not queued", error instanceof Error ? error.message : "unknown");
  }
}
