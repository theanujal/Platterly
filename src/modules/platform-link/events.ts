import "server-only";
import { receiveEvent, type PlatformEvent } from "@platterly/platform-contract";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { applyPersonProfile } from "./apply";
import { applyMembership } from "./membership";

export type PlatformEventOutcome = { status: 200; applied: boolean } | { status: 400 | 401 | 409; error: string };

/**
 * An event from the Platform (F6.2.1). The route's signature passed already; here: parse, check the signed id equals the body's, then the sequence guard
 * (all in `receiveEvent`). A duplicate or older event is answered 200 and changes nothing, so the sender stops retrying. The new sequence and the event are
 * stored in ONE transaction and only if the sequence is higher, so two deliveries racing cannot both be recorded.
 *
 * Every event is RECORDED whole. `person.profile` is also APPLIED (the person's name, phone and email follow the Account) in the same transaction, so it
 * is recorded only if it was applied. `membership.changed` is applied too (see `membership.ts`). Status and owner events are still recorded only.
 */
export async function handlePlatformEvent(input: { secrets: readonly string[]; headers: Headers; rawBody: string; method: string; url: string }): Promise<PlatformEventOutcome> {
  const received = await receiveEvent({
    ...input,
    lastApplied: async (businessId) => (await prisma.platformEventState.findUnique({ where: { businessId }, select: { lastSequence: true } }))?.lastSequence ?? null,
  });
  if (!received.ok) return { status: received.reason === "bad_json" || received.reason === "invalid_event" || received.reason === "id_mismatch" ? 400 : 401, error: received.reason };
  if (!received.apply) return { status: 200, applied: false };
  const event: PlatformEvent = received.event;
  try {
    return await record(event);
  } catch (error) {
    if (error instanceof Refused) return { status: 409, error: error.message };
    throw error;
  }
}

class Refused extends Error {}

function record(event: PlatformEvent): Promise<PlatformEventOutcome> {
  return prisma.$transaction(async (tx) => {
    // One statement that only moves the sequence up: a racing delivery that is not higher inserts/updates nothing.
    const advanced = await tx.$executeRaw`INSERT INTO platform_event_state ("businessId", "lastSequence", "updatedAt") VALUES (${event.businessId}, ${event.sequence}, now())
      ON CONFLICT ("businessId") DO UPDATE SET "lastSequence" = EXCLUDED."lastSequence", "updatedAt" = now() WHERE platform_event_state."lastSequence" < EXCLUDED."lastSequence"`;
    if (advanced !== 1) return { status: 200 as const, applied: false };
    if (event.type === "person.profile") await applyPersonProfile(tx, event.data);
    if (event.type === "membership.changed") {
      const result = await applyMembership(tx, event.businessId, event.data);
      // A refusal must roll back the sequence and the record too, so the same event can be sent again later.
      if (!result.ok) throw new Refused(result.error);
    }
    await tx.platformEvent.create({ data: { eventId: event.eventId, businessId: event.businessId, sequence: event.sequence, type: event.type, data: event.data as unknown as Prisma.InputJsonValue } });
    return { status: 200 as const, applied: true };
  });
}
