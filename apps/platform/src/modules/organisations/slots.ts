import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "../audit/write-audit";
import { SlotRaceError, type Context } from "./errors";

// F3.2.2 slot steps. A slot is one person's exclusive place in one product (G1: one per person per product across all businesses; G2: tied to its
// own membership). The database requires a `slot.allocated` / `slot.released` audit row for the exact slot id by commit, so these helpers write it.
// Slot steps belong to the ROUTE (create, link, unlink), never to `replaceAdmin`.
export type SlotTx = Pick<Prisma.TransactionClient, "membershipProductSlot" | "auditLog">;

/** How many of these people already hold a place in the product in a DIFFERENT business. Counts only; never names anyone. */
export async function slotsTakenElsewhere(tx: Pick<Prisma.TransactionClient, "membershipProductSlot">, organisationId: string, productKey: string, userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  return tx.membershipProductSlot.count({ where: { productKey, userId: { in: userIds }, organisationId: { not: organisationId } } });
}

export async function allocateSlot(tx: SlotTx, ctx: Context, s: { organisationId: string; productKey: string; memberId: string; userId: string; cause: string }): Promise<string> {
  const slotId = randomUUID();
  try {
    await tx.membershipProductSlot.create({ data: { slotId, userId: s.userId, productKey: s.productKey, organisationId: s.organisationId, memberId: s.memberId }, select: { slotId: true } });
  } catch (error) {
    // A lost race on the person-and-product key (G1) or the membership-and-product key (G2). The database has aborted the transaction.
    if ((error as { code?: string }).code === "P2002") throw new SlotRaceError("a slot for this person and product was taken by another transaction");
    throw error;
  }
  await writeAudit(tx, {
    action: "slot.allocated",
    outcome: "done",
    initiator: ctx.initiator,
    executor: ctx.executor,
    organisationId: s.organisationId,
    subject: { type: "slot", id: slotId },
    after: { productKey: s.productKey, memberId: s.memberId, cause: s.cause },
    requestId: ctx.requestId,
  });
  return slotId;
}

export async function releaseSlot(tx: SlotTx, ctx: Context, s: { slotId: string; organisationId: string; productKey: string; memberId: string; cause: string }): Promise<void> {
  await tx.membershipProductSlot.delete({ where: { slotId: s.slotId }, select: { slotId: true } });
  await writeAudit(tx, {
    action: "slot.released",
    outcome: "done",
    initiator: ctx.initiator,
    executor: ctx.executor,
    organisationId: s.organisationId,
    subject: { type: "slot", id: s.slotId },
    before: { productKey: s.productKey, memberId: s.memberId, cause: s.cause },
    requestId: ctx.requestId,
  });
}
