import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "../audit/write-audit";
import { allocateOutboxSequence, enqueueOutbox } from "../outbox/enqueue";
import { InvalidInputError, type Context, type Result } from "./errors";
import { lockOrganisation } from "./lock";

// F3.2.2 organisation status (`active` / `suspended`). One `organisation.status` event per linked product, all with the business's one sequence.
export async function setStatus(tx: Prisma.TransactionClient, ctx: Context, input: { organisationId: string; status: "active" | "suspended" }): Promise<Result<{ changed: boolean }>> {
  if (input.status !== "active" && input.status !== "suspended") throw new InvalidInputError("status is active or suspended");
  const org = await lockOrganisation(tx, input.organisationId);
  if (org.status === input.status) return { ok: true, changed: false };
  await tx.organisation.update({ where: { id: input.organisationId }, data: { status: input.status }, select: { id: true } });
  await writeAudit(tx, {
    action: "organisation.status_changed",
    outcome: "done",
    initiator: ctx.initiator,
    executor: ctx.executor,
    organisationId: input.organisationId,
    subject: { type: "organisation", id: input.organisationId },
    before: { status: org.status },
    after: { status: input.status },
    requestId: ctx.requestId,
  });
  const products = await tx.organisationProduct.findMany({ where: { organisationId: input.organisationId }, select: { productKey: true }, orderBy: { productKey: "asc" } });
  if (products.length > 0) {
    const sequence = await allocateOutboxSequence(tx, input.organisationId);
    for (const p of products) await enqueueOutbox(tx, { organisationId: input.organisationId, productKey: p.productKey, eventType: "organisation.status", payload: { status: input.status }, sequence });
  }
  return { ok: true, changed: true };
}
