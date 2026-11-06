import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "../audit/write-audit";
import { enqueueOutbox } from "../outbox/enqueue";
import type { Context, Refusal, RefusalCode } from "./errors";

// Shared by the F3.2.2 services: a refusal is audited (R-C2) and returned, so the caller commits the audit row and no state change.
export async function refuse(
  tx: Pick<Prisma.TransactionClient, "auditLog">,
  ctx: Context,
  action: string,
  organisationId: string | null,
  code: RefusalCode,
  detail?: Record<string, number | string>,
): Promise<Refusal> {
  await writeAudit(tx, {
    action,
    outcome: "refused",
    initiator: ctx.initiator,
    executor: ctx.executor,
    organisationId,
    subject: organisationId ? { type: "organisation", id: organisationId } : undefined,
    reasonCode: code,
    payload: detail ?? {},
    requestId: ctx.requestId,
  });
  return { ok: false, code, detail };
}

/** One `membership.changed` event (central role `admin`) for every product the business is linked to, or only `productKey` when given. */
export async function queueMembership(
  tx: Pick<Prisma.TransactionClient, "organisationProduct" | "organisation" | "outboxEvent">,
  organisationId: string,
  m: { userId: string; status: "active" | "disabled" | "removed"; membershipVersion: number },
  productKey?: string,
): Promise<void> {
  const keys = productKey ? [productKey] : (await tx.organisationProduct.findMany({ where: { organisationId }, select: { productKey: true }, orderBy: { productKey: "asc" } })).map((p) => p.productKey);
  for (const key of keys) {
    await enqueueOutbox(tx, { organisationId, productKey: key, eventType: "membership.changed", payload: { userId: m.userId, role: "admin", status: m.status, membershipVersion: m.membershipVersion } });
  }
}
