import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { loadCredentials, openGuarded, type Credentials } from "../../../lib/migration-roundtrip/__tests__/db-target";
import { BACKOFF_MS, DEAD_AFTER_MS, LEASE_MS, blockedPairs, claimNext, pairHealth, resolveDeadEvent, runDeliveryBatch, settle, type DeliverableEvent, type Sender } from "../deliver";

// F3.3.2 outbox worker against the real isolated Stage 2 PostgreSQL, with a fake sender and a controlled clock. Real delivery is IC1 (W3) and is
// not claimed. Outbox rows have no foreign key and no append-only trigger, so the committed rows are removed by exact id; the audit rows written by
// the resolve tests stay inside rolled-back transactions (audit rows can never be deleted).
const credentials = loadCredentials(process.env.PLATFORM_TEST_CREDENTIALS_DIR);
class Rollback extends Error {}
const bizId = () => `biz_${randomBytes(16).toString("hex")}`;
const T0 = new Date("2026-11-06T10:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe.skipIf(credentials === null)("F3.3.2 outbox delivery worker against the real database (fake sender)", () => {
  const creds = credentials as Credentials;
  let pool: Pool;
  let prisma: PrismaClient;
  const made = new Set<string>();

  /** Seed events for one (organisation, product) pair with sequences 1..n, all due at T0. */
  const seed = async (n: number, opts: { org?: string; product?: string; createdAt?: Date } = {}) => {
    const organisationId = opts.org ?? bizId();
    const productKey = opts.product ?? "alpha";
    const ids: string[] = [];
    for (let seq = 1; seq <= n; seq++) {
      const row = await prisma.outboxEvent.create({
        data: { eventId: randomUUID(), organisationId, productKey, eventType: "membership.changed", payload: { seq }, sequence: BigInt(seq), nextAttemptAt: T0, createdAt: opts.createdAt ?? T0 },
        select: { id: true, eventId: true },
      });
      made.add(row.id);
      ids.push(row.eventId);
    }
    return { organisationId, productKey, ids };
  };
  const row = (eventId: string) => prisma.outboxEvent.findUniqueOrThrow({ where: { eventId } });
  const fail: { ok: false; error: string } = { ok: false, error: "product down" };

  beforeAll(async () => {
    const target = await openGuarded(creds, { applicationName: "platform-f332-guard" });
    await target.close();
    pool = new Pool({ connectionString: creds.url(), max: 20, application_name: "platform-f332" });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    expect(await prisma.outboxEvent.count(), "outbox_events must be empty before the test").toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  }, 60_000);

  let totalMade = 0;
  // Each test starts with no leftover pending rows (they would be claimed by the next test's worker).
  afterEach(async () => {
    if (!prisma) return;
    totalMade += made.size;
    await prisma.outboxEvent.deleteMany({ where: { id: { in: [...made] } } });
    made.clear();
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      totalMade += made.size;
      await prisma.outboxEvent.deleteMany({ where: { id: { in: [...made] } } });
      const left = { outbox: await prisma.outboxEvent.count(), audit: await prisma.auditLog.count() };
      console.log(`CLEANUP outbox-created=${totalMade} remaining=${JSON.stringify(left)}`);
      expect(left).toEqual({ outbox: 0, audit: 0 });
    } finally {
      await prisma.$disconnect();
      await pool.end();
    }
  });

  describe("claiming and head-of-line", () => {
    it("only the lowest pending sequence of a pair is claimable; N+1 waits for N to be delivered", async () => {
      const { ids } = await seed(3);
      const c1 = await claimNext(prisma, T0);
      expect(c1?.event.eventId).toBe(ids[0]);
      expect(c1?.event.attempts).toBe(1);
      expect(await claimNext(prisma, T0), "seq 2 must not pass a leased seq 1").toBeNull();
      expect(await settle(prisma, c1!, { ok: true }, T0)).toBe("delivered");
      expect((await row(ids[0])).status).toBe("delivered");
      const c2 = await claimNext(prisma, T0);
      expect(c2?.event.eventId).toBe(ids[1]);
      expect(await settle(prisma, c2!, { ok: true }, T0)).toBe("delivered");
      const c3 = await claimNext(prisma, T0);
      expect(c3?.event.eventId).toBe(ids[2]);
      await settle(prisma, c3!, { ok: true }, T0);
      expect(await claimNext(prisma, T0)).toBeNull();
    });

    it("a pending event in retry blocks the ones behind it; a different pair is not held up", async () => {
      const blocked = await seed(2, { product: "alpha" });
      const other = await seed(1, { org: blocked.organisationId, product: "beta" });
      const c = await claimNext(prisma, T0);
      expect(c?.event.sequence).toBe(BigInt(1));
      const first = c!;
      // Whichever pair was claimed first, fail it and check the other pair still flows and the failed pair stays blocked.
      expect(await settle(prisma, first, fail, T0)).toBe("retry");
      const next = await claimNext(prisma, at(1000));
      expect(next).not.toBeNull();
      expect(next!.event.productKey === first.event.productKey && next!.event.sequence > first.event.sequence).toBe(false);
      await settle(prisma, next!, { ok: true }, at(1000));
      void other;
    });
  });

  describe("failure, backoff and dead-letter", () => {
    it("retries after 1 min, 5 min, 30 min, 2 h, 12 h, 24 h and then keeps 24 h", async () => {
      const { ids } = await seed(1);
      let now = T0;
      const seen: number[] = [];
      for (let i = 0; i < 8; i++) {
        const c = await claimNext(prisma, now);
        expect(c, `attempt ${i + 1} should be claimable`).not.toBeNull();
        expect(c!.event.attempts).toBe(i + 1);
        expect(await settle(prisma, c!, fail, now)).toBe("retry");
        const r = await row(ids[0]);
        seen.push(r.nextAttemptAt.getTime() - now.getTime());
        expect(await claimNext(prisma, new Date(r.nextAttemptAt.getTime() - 1)), "not due yet").toBeNull();
        now = r.nextAttemptAt;
      }
      expect(seen).toEqual([...BACKOFF_MS, BACKOFF_MS[5], BACKOFF_MS[5]]);
      expect((await row(ids[0])).lastError).toBe("product down");
    });

    it("becomes dead when the next try would fall after 7 days, and a dead event blocks later ones for ever (nothing releases it by itself)", async () => {
      const { ids, organisationId, productKey } = await seed(2);
      const late = at(DEAD_AFTER_MS - 60_000); // the 1-minute backoff would land exactly at 7 days: still allowed
      const c = await claimNext(prisma, late);
      expect(c!.event.eventId).toBe(ids[0]);
      expect(await settle(prisma, c!, fail, late)).toBe("retry");
      const nextDue = (await row(ids[0])).nextAttemptAt;
      const c2 = await claimNext(prisma, nextDue);
      expect(await settle(prisma, c2!, fail, nextDue)).toBe("dead");
      const dead = await row(ids[0]);
      expect(dead.status).toBe("dead");
      expect(dead.lockedUntil).toBeNull();
      // Years later, the second event is still not delivered.
      expect(await claimNext(prisma, at(DEAD_AFTER_MS * 100))).toBeNull();
      expect((await row(ids[1])).status).toBe("pending");
      const pairs = await blockedPairs(prisma, at(DEAD_AFTER_MS));
      const mine = pairs.find((p) => p.organisationId === organisationId && p.productKey === productKey);
      expect(mine).toMatchObject({ firstDeadSequence: BigInt(1), deadCount: 1, depth: 1 });
      expect(mine!.oldestDeadAgeSeconds).toBeGreaterThan(0);
      expect(await pairHealth(prisma, organisationId, productKey)).toBe("blocked");
    });

    it("a sender that throws is a failed attempt, and runDeliveryBatch reports the outcomes", async () => {
      await seed(1);
      const sender: Sender = async () => {
        throw new Error("boom");
      };
      const out = await runDeliveryBatch(prisma, sender, { limit: 5, now: () => at(10_000_000_000) });
      // Other seeded pairs from earlier tests may also be due; at least this one was claimed and retried.
      expect(out.claimed).toBeGreaterThanOrEqual(1);
      expect(out.retried + out.dead).toBe(out.claimed);
      expect(out.delivered).toBe(0);
    });
  });

  describe("leases, duplicates and two workers", () => {
    it("a crashed worker's lease expires and the row is retried; the late result of the first claim is ignored", async () => {
      const { ids } = await seed(1);
      const first = await claimNext(prisma, T0);
      expect(first!.event.eventId).toBe(ids[0]);
      expect(await claimNext(prisma, at(LEASE_MS - 1)), "still leased").toBeNull();
      const second = await claimNext(prisma, at(LEASE_MS + 1));
      expect(second!.event.eventId).toBe(ids[0]);
      expect(second!.event.attempts).toBe(2);
      // The same row, the same event id and sequence: the receiving side ignores the repeat.
      expect(second!.event.sequence).toBe(first!.event.sequence);
      expect(await settle(prisma, first!, { ok: true }, at(LEASE_MS + 2)), "the old lease cannot settle").toBe("lost_lease");
      expect((await row(ids[0])).status).toBe("pending");
      expect(await settle(prisma, second!, { ok: true }, at(LEASE_MS + 3))).toBe("delivered");
    });

    it("twelve workers over twenty independent pairs deliver every event exactly once", async () => {
      const pairs = await Promise.all(Array.from({ length: 20 }, () => seed(1)));
      const wanted = new Set(pairs.flatMap((p) => p.ids));
      const sent: string[] = [];
      const sender: Sender = async (e: DeliverableEvent) => {
        if (wanted.has(e.eventId)) sent.push(e.eventId);
        await new Promise((r) => setTimeout(r, 5));
        return { ok: true };
      };
      await Promise.all(Array.from({ length: 12 }, () => runDeliveryBatch(prisma, sender, { limit: 10, now: () => T0 })));
      expect(sent.sort()).toEqual([...wanted].sort());
      for (const p of pairs) expect((await row(p.ids[0])).status).toBe("delivered");
    });

    it("two workers on one pair of 10 events deliver them in order, one at a time", async () => {
      const { ids } = await seed(10);
      const order: string[] = [];
      const sender: Sender = async (e) => {
        if (ids.includes(e.eventId)) order.push(e.eventId);
        return { ok: true };
      };
      for (let round = 0; round < 12; round++) await Promise.all([runDeliveryBatch(prisma, sender, { limit: 3, now: () => T0 }), runDeliveryBatch(prisma, sender, { limit: 3, now: () => T0 })]);
      expect(order).toEqual(ids);
    });
  });

  describe("resolving a dead blocker (audited, named actor, reason)", () => {
    const staff = { kind: "staff" as const, ref: "ops-person-1" };
    const inTx = async (fn: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<void>) => {
      const err = await prisma.$transaction(async (tx) => { await fn(tx); throw new Rollback(); }).catch((e: unknown) => e);
      if (!(err instanceof Rollback)) throw err;
    };
    const makeDead = async (n = 2) => {
      const s = await seed(n);
      await prisma.outboxEvent.update({ where: { eventId: s.ids[0] }, data: { status: "dead", lastError: "gave up", attempts: 9 } });
      return s;
    };

    it("replayed: attempts reset and the event is tried again, one audit row, then the pair flows", async () => {
      const { ids } = await makeDead();
      await inTx(async (tx) => {
        expect(await resolveDeadEvent(tx, { eventId: ids[0], resolution: "replayed", actor: staff, reason: "product back online" }, T0)).toEqual({ ok: true, resolution: "replayed" });
        const r = await tx.outboxEvent.findUniqueOrThrow({ where: { eventId: ids[0] } });
        expect(r).toMatchObject({ status: "pending", attempts: 0 });
        const audit = await tx.auditLog.findMany({ where: { subjectId: ids[0] } });
        expect(audit).toMatchObject([{ action: "outbox.replayed", outcome: "done", initiatorRef: "ops-person-1", reason: "product back online" }]);
      });
      expect((await row(ids[0])).status, "rolled back: still dead").toBe("dead");
    });

    it("reconciled: needs the product's own report to cover the sequence; then resolved with evidence, and the pair unblocks", async () => {
      const { ids, organisationId, productKey } = await makeDead();
      await inTx(async (tx) => {
        expect(await resolveDeadEvent(tx, { eventId: ids[0], resolution: "reconciled", actor: staff, reason: "checked" }, T0)).toEqual({ ok: false, code: "evidence_insufficient" });
        expect(await resolveDeadEvent(tx, { eventId: ids[0], resolution: "reconciled", actor: staff, reason: "checked", evidence: { productLastAppliedSequence: 0 } }, T0)).toEqual({ ok: false, code: "evidence_insufficient" });
        expect((await tx.outboxEvent.findUniqueOrThrow({ where: { eventId: ids[0] } })).status).toBe("dead");
        expect(await resolveDeadEvent(tx, { eventId: ids[0], resolution: "reconciled", actor: staff, reason: "product reports applied", evidence: { productLastAppliedSequence: 1 } }, T0)).toEqual({ ok: true, resolution: "reconciled" });
        const r = await tx.outboxEvent.findUniqueOrThrow({ where: { eventId: ids[0] } });
        expect(r).toMatchObject({ status: "resolved", resolution: "reconciled", resolvedBy: "ops-person-1" });
        expect(r.resolvedAt).not.toBeNull();
        expect(r.resolutionEvidence).toMatchObject({ productLastAppliedSequence: 1 });
        expect(await pairHealth(tx, organisationId, productKey)).toBe("healthy");
        const next = await claimNext(tx, T0);
        expect(next?.event.eventId, "the next event is now deliverable").toBe(ids[1]);
        const audits = await tx.auditLog.findMany({ where: { subjectId: ids[0] }, orderBy: { occurredAt: "asc" } });
        expect(audits.map((a) => [a.action, a.outcome, a.reasonCode])).toEqual([["outbox.reconciled", "refused", "evidence_insufficient"], ["outbox.reconciled", "refused", "evidence_insufficient"], ["outbox.reconciled", "done", null]]);
      });
    });

    it("waived: resolved with the reason recorded, the pair then needs reconciliation until a later reconciliation, and the next event flows", async () => {
      const { ids, organisationId, productKey } = await makeDead(3);
      await inTx(async (tx) => {
        expect(await resolveDeadEvent(tx, { eventId: ids[0], resolution: "waived", actor: staff, reason: "superseded by seq 2" }, T0)).toEqual({ ok: true, resolution: "waived" });
        const r = await tx.outboxEvent.findUniqueOrThrow({ where: { eventId: ids[0] } });
        expect(r).toMatchObject({ status: "resolved", resolution: "waived" });
        expect(r.resolutionEvidence).toMatchObject({ reason: "superseded by seq 2" });
        expect(await pairHealth(tx, organisationId, productKey)).toBe("needs_reconciliation");
        expect((await claimNext(tx, T0))?.event.eventId).toBe(ids[1]);
      });
    });

    it("refuses without a named actor, without a reason, for an event that is not dead, and for an unknown event; each refusal is audited and changes nothing", async () => {
      const { ids } = await makeDead();
      await inTx(async (tx) => {
        expect(await resolveDeadEvent(tx, { eventId: ids[0], resolution: "waived", actor: { kind: "staff", ref: " " }, reason: "x" }, T0)).toEqual({ ok: false, code: "actor_required" });
        expect(await resolveDeadEvent(tx, { eventId: ids[0], resolution: "waived", actor: staff, reason: "  " }, T0)).toEqual({ ok: false, code: "reason_required" });
        expect(await resolveDeadEvent(tx, { eventId: ids[1], resolution: "waived", actor: staff, reason: "x" }, T0)).toEqual({ ok: false, code: "not_dead" });
        expect(await resolveDeadEvent(tx, { eventId: randomUUID(), resolution: "waived", actor: staff, reason: "x" }, T0)).toEqual({ ok: false, code: "not_found" });
        expect((await tx.outboxEvent.findUniqueOrThrow({ where: { eventId: ids[0] } })).status).toBe("dead");
        expect(await tx.auditLog.count({ where: { subjectId: { in: ids }, outcome: "refused" } })).toBe(3);
      });
    });

    it("resolving races with a worker: a dead event is never claimable, and resolving twice is refused", async () => {
      const { ids } = await makeDead();
      expect(await claimNext(prisma, T0), "nothing is claimable while the head is dead").toBeNull();
      await inTx(async (tx) => {
        expect((await resolveDeadEvent(tx, { eventId: ids[0], resolution: "waived", actor: staff, reason: "first" }, T0)).ok).toBe(true);
        expect(await resolveDeadEvent(tx, { eventId: ids[0], resolution: "waived", actor: staff, reason: "second" }, T0)).toEqual({ ok: false, code: "not_dead" });
      });
    });
  });
});
