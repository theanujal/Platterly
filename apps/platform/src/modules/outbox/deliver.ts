import type { Prisma } from "@/generated/prisma/client";
import { writeAudit, type Actor } from "../audit/write-audit";

// F3.3.2 outbox delivery worker (W1-C, clarification C). Fake sender only: real signed delivery to a product is checkpoint IC1 in W3 and is NOT
// claimed here. The sender is injected; the worker never opens a transaction around the HTTP call.
//
//  - Ordering: head-of-line per (organisation, product). Event N+1 is never claimed while any earlier event of that pair is `pending` (waiting,
//    leased or in retry) or `dead`. A dead event stays a blocker until a named staff member resolves it.
//  - Claiming: one atomic UPDATE ... FOR UPDATE SKIP LOCKED sets a 60 s lease and counts the attempt. Two workers never claim the same row. A
//    crashed worker's lease expires and the row is retried.
//  - Failure: backoff 1 min, 5 min, 30 min, 2 h, 12 h, 24 h; after 7 days from creation the event becomes `dead` (and keeps blocking).
//  - Settling is conditional on the lease the worker holds, so a late result cannot overwrite a newer claim or a staff resolution.

export const LEASE_MS = 60_000;
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000, 24 * 3_600_000] as const;
export const DEAD_AFTER_MS = 7 * 24 * 3_600_000;

export type DeliverableEvent = { id: string; eventId: string; organisationId: string; productKey: string; eventType: string; payload: unknown; sequence: bigint; attempts: number };
export type SendResult = { ok: true } | { ok: false; error: string };
/** Delivers one event to its product. It must be idempotent on `eventId` on the receiving side; a resend of the same row is harmless. */
export type Sender = (event: DeliverableEvent) => Promise<SendResult>;
export type DeliveryDb = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

type Row = { id: string; event_id: string; organisation_id: string; product_key: string; event_type: string; payload: unknown; sequence: bigint; attempts: number; locked_until: Date; created_at: Date };

export type Claim = { event: DeliverableEvent; leaseUntil: Date; createdAt: Date };

/** Claim the next deliverable event, or null. Only the lowest pending sequence of a pair qualifies, and never behind a pending or dead earlier one. */
export async function claimNext(db: DeliveryDb, now: Date): Promise<Claim | null> {
  const lease = new Date(now.getTime() + LEASE_MS);
  const rows = await db.$queryRaw<Row[]>`
    with candidate as (
      select e.id from outbox_events e
      where e.status = 'pending'
        and e.next_attempt_at <= ${now}
        and (e.locked_until is null or e.locked_until <= ${now})
        and not exists (
          select 1 from outbox_events p
          where p.organisation_id = e.organisation_id and p.product_key = e.product_key
            and p.sequence < e.sequence and p.status in ('pending', 'dead')
        )
      order by e.next_attempt_at, e.created_at, e.sequence
      limit 1
      for update skip locked
    )
    update outbox_events o set locked_until = ${lease}, attempts = o.attempts + 1
    from candidate c where o.id = c.id
    returning o.id, o.event_id, o.organisation_id, o.product_key, o.event_type, o.payload, o.sequence, o.attempts, o.locked_until, o.created_at`;
  if (rows.length === 0) return null;
  const r = rows[0];
  return { event: { id: r.id, eventId: r.event_id, organisationId: r.organisation_id, productKey: r.product_key, eventType: r.event_type, payload: r.payload, sequence: BigInt(r.sequence), attempts: r.attempts }, leaseUntil: r.locked_until, createdAt: r.created_at };
}

/** The delay before the next try after `attempts` failures, or null when the event would be retried after its 7 days are up (it dies instead). */
export function nextDelayMs(attempts: number, createdAt: Date, now: Date): number | null {
  const delay = BACKOFF_MS[Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1];
  return now.getTime() + delay > createdAt.getTime() + DEAD_AFTER_MS ? null : delay;
}

export type Settled = "delivered" | "retry" | "dead" | "lost_lease";

export async function settle(db: DeliveryDb, claim: Claim, result: SendResult, now: Date): Promise<Settled> {
  const { id } = claim.event;
  if (result.ok) {
    const n = await db.$executeRaw`update outbox_events set status = 'delivered', delivered_at = ${now}, locked_until = null, last_error = null where id = ${id}::uuid and status = 'pending' and locked_until = ${claim.leaseUntil}`;
    return n === 1 ? "delivered" : "lost_lease";
  }
  const error = result.error.slice(0, 500);
  const delay = nextDelayMs(claim.event.attempts, claim.createdAt, now);
  if (delay === null) {
    const n = await db.$executeRaw`update outbox_events set status = 'dead', locked_until = null, last_error = ${error} where id = ${id}::uuid and status = 'pending' and locked_until = ${claim.leaseUntil}`;
    return n === 1 ? "dead" : "lost_lease";
  }
  const next = new Date(now.getTime() + delay);
  const n = await db.$executeRaw`update outbox_events set next_attempt_at = ${next}, locked_until = null, last_error = ${error} where id = ${id}::uuid and status = 'pending' and locked_until = ${claim.leaseUntil}`;
  return n === 1 ? "retry" : "lost_lease";
}

export type BatchResult = { claimed: number; delivered: number; retried: number; dead: number; lostLease: number };

/** Claim and send up to `limit` events, one at a time. A sender that throws counts as a failed attempt. */
export async function runDeliveryBatch(db: DeliveryDb, sender: Sender, opts: { limit: number; now?: () => Date }): Promise<BatchResult> {
  const out: BatchResult = { claimed: 0, delivered: 0, retried: 0, dead: 0, lostLease: 0 };
  const clock = opts.now ?? (() => new Date());
  for (let i = 0; i < opts.limit; i++) {
    const claim = await claimNext(db, clock());
    if (!claim) break;
    out.claimed++;
    let result: SendResult;
    try {
      result = await sender(claim.event);
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : "sender threw" };
    }
    const settled = await settle(db, claim, result, clock());
    if (settled === "delivered") out.delivered++;
    else if (settled === "retry") out.retried++;
    else if (settled === "dead") out.dead++;
    else out.lostLease++;
  }
  return out;
}

// ---- Blocked pairs and health --------------------------------------------------------------------------------------------------------------

export type BlockedPair = { organisationId: string; productKey: string; firstDeadSequence: bigint; deadCount: number; depth: number; oldestDeadAgeSeconds: number };

/** Every (organisation, product) pair held up by a dead event: how many dead, how many events wait behind, and how long the oldest has been dead. */
export async function blockedPairs(db: Pick<DeliveryDb, "$queryRaw">, now: Date): Promise<BlockedPair[]> {
  const rows = await db.$queryRaw<{ organisation_id: string; product_key: string; first_dead: bigint; dead_count: number; depth: number; oldest: number }[]>`
    select d.organisation_id, d.product_key, min(d.sequence) as first_dead, count(*)::int as dead_count,
      (select count(*)::int from outbox_events w where w.organisation_id = d.organisation_id and w.product_key = d.product_key and w.status = 'pending') as depth,
      extract(epoch from (${now}::timestamptz - min(d.created_at)))::float8 as oldest
    from outbox_events d where d.status = 'dead'
    group by d.organisation_id, d.product_key order by oldest desc`;
  return rows.map((r) => ({ organisationId: r.organisation_id, productKey: r.product_key, firstDeadSequence: BigInt(r.first_dead), deadCount: r.dead_count, depth: r.depth, oldestDeadAgeSeconds: Math.round(r.oldest) }));
}

export type PairHealth = "blocked" | "needs_reconciliation" | "healthy";

/**
 * `blocked` while a dead event exists; `needs_reconciliation` after a waived resolution until a later (or equal) sequence is reconciled with the
 * product's evidence; otherwise `healthy`. A waived event is never described as healthy on Platform's own say-so.
 */
export async function pairHealth(db: Pick<DeliveryDb, "$queryRaw">, organisationId: string, productKey: string): Promise<PairHealth> {
  const rows = await db.$queryRaw<{ dead: number; waived_max: bigint | null; reconciled_max: bigint | null }[]>`
    select (select count(*)::int from outbox_events where organisation_id = ${organisationId} and product_key = ${productKey} and status = 'dead') as dead,
      (select max(sequence) from outbox_events where organisation_id = ${organisationId} and product_key = ${productKey} and resolution = 'waived') as waived_max,
      (select max(sequence) from outbox_events where organisation_id = ${organisationId} and product_key = ${productKey} and resolution = 'reconciled') as reconciled_max`;
  const r = rows[0];
  if (r.dead > 0) return "blocked";
  if (r.waived_max !== null && (r.reconciled_max === null || BigInt(r.reconciled_max) < BigInt(r.waived_max))) return "needs_reconciliation";
  return "healthy";
}

// ---- Releasing a dead blocker --------------------------------------------------------------------------------------------------------------

export type Resolution = "replayed" | "reconciled" | "waived";
export type ResolveRefusal = "not_found" | "not_dead" | "actor_required" | "reason_required" | "evidence_insufficient";
export type ResolveResult = { ok: true; resolution: Resolution } | { ok: false; code: ResolveRefusal };
export type ResolveTx = Pick<Prisma.TransactionClient, "outboxEvent" | "auditLog">;

/** Recovery is confirmed only by the PRODUCT's report: its last-applied sequence for the business is at least the dead event's. */
export function reconciliationSatisfied(eventSequence: bigint, evidence: unknown): boolean {
  if (typeof evidence !== "object" || evidence === null) return false;
  const e = evidence as { productLastAppliedSequence?: unknown };
  const reported = typeof e.productLastAppliedSequence === "number" && Number.isSafeInteger(e.productLastAppliedSequence) ? BigInt(e.productLastAppliedSequence) : null;
  return reported !== null && reported >= eventSequence;
}

export type ResolveInput = { eventId: string; resolution: Resolution; actor: Actor; reason: string; evidence?: Prisma.InputJsonObject };

/**
 * One of three audited actions by a named actor with a reason (the caller's transaction):
 *  - `replayed`   reset the attempts and the schedule so the worker tries again. The event stays `pending` (the table requires the resolution
 *                 columns to be set only on `resolved` rows, and a replayed event is not resolved until it is delivered); the audit row records it.
 *  - `reconciled` the product's own report proves it applied this sequence (`evidence.productLastAppliedSequence`). Status `resolved`.
 *  - `waived`     staff decide the event is not needed. Status `resolved`; the pair then reports `needs_reconciliation` until reconciled.
 * A refusal is audited and nothing changes.
 */
export async function resolveDeadEvent(tx: ResolveTx, input: ResolveInput, now: Date = new Date()): Promise<ResolveResult> {
  const actor: Actor = { kind: input.actor.kind, ref: input.actor.ref.trim() || "(missing)" };
  const audit = async (outcome: "done" | "refused", organisationId: string | null, extra: { reasonCode?: string; before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue } = {}) =>
    writeAudit(tx, {
      action: `outbox.${input.resolution}`,
      outcome,
      // A blank actor cannot be written (the table requires a reference); the refusal is recorded under a visible placeholder.
      initiator: actor,
      executor: actor,
      organisationId,
      subject: { type: "outbox_event", id: input.eventId },
      reason: input.reason || undefined,
      payload: input.evidence ? { evidence: input.evidence } : {},
      ...extra,
    });
  const event = await tx.outboxEvent.findUnique({ where: { eventId: input.eventId } });
  if (!event) return { ok: false, code: "not_found" };
  const refuse = async (code: ResolveRefusal): Promise<ResolveResult> => {
    await audit("refused", event.organisationId, { reasonCode: code });
    return { ok: false, code };
  };
  if (!input.actor.ref.trim()) return refuse("actor_required");
  if (!input.reason.trim()) return refuse("reason_required");
  if (event.status !== "dead") return refuse("not_dead");
  if (input.resolution === "reconciled" && !reconciliationSatisfied(event.sequence, input.evidence)) return refuse("evidence_insufficient");

  const before = { status: event.status, attempts: event.attempts, lastError: event.lastError, sequence: event.sequence.toString() };
  if (input.resolution === "replayed") {
    const changed = await tx.outboxEvent.updateMany({ where: { id: event.id, status: "dead" }, data: { status: "pending", attempts: 0, nextAttemptAt: now, lockedUntil: null } });
    if (changed.count !== 1) return refuse("not_dead");
    await audit("done", event.organisationId, { before, after: { status: "pending", attempts: 0 } });
    return { ok: true, resolution: "replayed" };
  }
  const changed = await tx.outboxEvent.updateMany({
    where: { id: event.id, status: "dead" },
    data: { status: "resolved", resolution: input.resolution, resolvedAt: now, resolvedBy: input.actor.ref, resolutionEvidence: { reason: input.reason, ...(input.evidence ?? {}) } },
  });
  if (changed.count !== 1) return refuse("not_dead");
  await audit("done", event.organisationId, { before, after: { status: "resolved", resolution: input.resolution } });
  return { ok: true, resolution: input.resolution };
}
