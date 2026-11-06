import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { sensitivePaths } from "../audit/redact";

// W1-B outbox writer (clarification C, docs/w1-implementation-plan.md). It takes the CALLER'S transaction client; it never opens a transaction.
//
// Sequence allocation is `UPDATE organisations SET outbox_sequence = outbox_sequence + 1 ... RETURNING`, inside the caller's transaction and
// therefore under the organisation row lock the caller already holds (`lockOrganisation`, F3.2.2). The increment commits or rolls back with
// the event row, so no number is consumed by a rollback, and sequence order equals commit order. Delivery is not built here.
//
// One event for several products shares one business sequence: call `allocateOutboxSequence` once, then `enqueueOutbox` per product with
// `{ sequence }`. Without `sequence`, each call allocates its own.

export type OutboxTx = Pick<Prisma.TransactionClient, "organisation" | "outboxEvent">;

export class OutboxInputError extends Error {}
export class OutboxOrganisationNotFoundError extends Error {}

export type EnqueueInput = {
  organisationId: string;
  productKey: string;
  eventType: string;
  payload: Prisma.InputJsonObject;
  /** Reuse a sequence from `allocateOutboxSequence` (one business event addressed to several products). */
  sequence?: bigint;
  /** Defaults to a new UUID. Supplied only by tests and replays; it must be unique. */
  eventId?: string;
};

export async function allocateOutboxSequence(tx: Pick<OutboxTx, "organisation">, organisationId: string): Promise<bigint> {
  try {
    const row = await tx.organisation.update({ where: { id: organisationId }, data: { outboxSequence: { increment: 1 } }, select: { outboxSequence: true } });
    return row.outboxSequence;
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") throw new OutboxOrganisationNotFoundError(`organisation ${organisationId} does not exist`);
    throw error;
  }
}

export async function enqueueOutbox(tx: OutboxTx, input: EnqueueInput): Promise<{ eventId: string; sequence: bigint }> {
  const leaked = sensitivePaths(input.payload);
  if (leaked.length > 0) throw new OutboxInputError(`an outbox payload cannot carry sensitive keys: ${leaked.join(", ")}`);
  if (input.sequence !== undefined && input.sequence <= BigInt(0)) throw new OutboxInputError("a sequence is positive");
  const sequence = input.sequence ?? (await allocateOutboxSequence(tx, input.organisationId));
  const eventId = input.eventId ?? randomUUID();
  await tx.outboxEvent.create({
    data: { eventId, organisationId: input.organisationId, productKey: input.productKey, eventType: input.eventType, payload: input.payload, sequence },
    select: { id: true },
  });
  return { eventId, sequence };
}
