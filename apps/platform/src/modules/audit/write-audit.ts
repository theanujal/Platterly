import type { Prisma } from "@/generated/prisma/client";
import { redact } from "./redact";

// W1-B audit writer (docs/w1-implementation-plan.md, W1-B). It takes the CALLER'S transaction client and writes one append-only audit row in
// it, so the row commits or rolls back with the change it describes. It never opens a transaction and never touches the global client.
// Values under sensitive keys (secret, token, password, otp, hash) are redacted before the row is written. `organisationId` is optional
// (user-level events); the table has no foreign key to organisations, so history survives a manual organisation deletion.

export type Actor = { kind: "user" | "staff" | "system"; ref: string };
type Json = Prisma.InputJsonValue;

export type AuditInput = {
  action: string;
  outcome: "done" | "refused";
  initiator: Actor;
  executor: Actor;
  organisationId?: string | null;
  subject?: { type: string; id: string };
  /** Required when the outcome is `refused`. */
  reasonCode?: string;
  reason?: string;
  caseRef?: string;
  approval?: Json;
  before?: Json;
  after?: Json;
  payload?: Json;
  requestId?: string;
};

/** The only part of the transaction client this writer uses. */
export type AuditTx = Pick<Prisma.TransactionClient, "auditLog">;

export class AuditInputError extends Error {}

export async function writeAudit(tx: AuditTx, input: AuditInput): Promise<{ id: string }> {
  if (input.outcome === "refused" && !input.reasonCode?.trim()) throw new AuditInputError("a refused outcome needs a reason code");
  if (!input.action.trim()) throw new AuditInputError("an audit row needs an action");
  const data: Prisma.AuditLogUncheckedCreateInput = {
    action: input.action,
    outcome: input.outcome,
    initiatorKind: input.initiator.kind,
    initiatorRef: input.initiator.ref,
    executorKind: input.executor.kind,
    executorRef: input.executor.ref,
    organisationId: input.organisationId ?? null,
    subjectType: input.subject?.type ?? null,
    subjectId: input.subject?.id ?? null,
    reasonCode: input.reasonCode ?? null,
    reason: input.reason ?? null,
    caseRef: input.caseRef ?? null,
    requestId: input.requestId ?? null,
    payload: redact(input.payload ?? {}),
    ...(input.approval !== undefined ? { approval: redact(input.approval) } : {}),
    ...(input.before !== undefined ? { before: redact(input.before) } : {}),
    ...(input.after !== undefined ? { after: redact(input.after) } : {}),
  };
  const row = await tx.auditLog.create({ data, select: { id: true } });
  return { id: row.id };
}
