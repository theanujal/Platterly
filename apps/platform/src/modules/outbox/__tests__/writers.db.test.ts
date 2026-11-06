import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { loadCredentials, openGuarded, type Credentials } from "../../../lib/migration-roundtrip/__tests__/db-target";
import { writeAudit } from "../../audit/write-audit";
import { allocateOutboxSequence, enqueueOutbox } from "../enqueue";

// W1-B writers against the real isolated Stage 2 PostgreSQL. The guard is opened once and released (no run-log rows). Audit rows can never be
// deleted, so every audit write here happens inside a transaction that is rolled back on purpose. Committed rows (the organisations and
// their outbox events) are removed by exact id in afterAll, and the audit table is proven empty at the start and the end.
const credentials = loadCredentials(process.env.PLATFORM_TEST_CREDENTIALS_DIR);
const bizId = () => `biz_${randomBytes(16).toString("hex")}`;
class Rollback extends Error {}

describe.skipIf(credentials === null)("W1-B audit and outbox writers against the real database", () => {
  const creds = credentials as Credentials;
  let pool: Pool;
  let prisma: PrismaClient;
  const orgs: string[] = [];

  const newOrg = async () => {
    const id = bizId();
    orgs.push(id);
    await prisma.organisation.create({ data: { id, name: "Writer Test" } });
    return id;
  };
  const auditCount = () => prisma.auditLog.count();
  const outboxFor = (id: string) => prisma.outboxEvent.findMany({ where: { organisationId: id }, orderBy: { sequence: "asc" } });
  const counter = async (id: string) => (await prisma.organisation.findUniqueOrThrow({ where: { id } })).outboxSequence;
  const rolledBack = async (fn: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<unknown>) => {
    await expect(prisma.$transaction(async (tx) => { await fn(tx); throw new Rollback(); })).rejects.toBeInstanceOf(Rollback);
  };

  beforeAll(async () => {
    const target = await openGuarded(creds, { applicationName: "platform-w1b-guard" });
    await target.close();
    pool = new Pool({ connectionString: creds.url(), max: 20, application_name: "platform-w1b" });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    expect(await auditCount(), "audit_logs must be empty before the test").toBe(0);
    expect(await prisma.organisation.count()).toBe(0);
    expect(await prisma.outboxEvent.count()).toBe(0);
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.outboxEvent.deleteMany({ where: { organisationId: { in: orgs } } });
      await prisma.organisation.deleteMany({ where: { id: { in: orgs } } });
      const left = { audit: await auditCount(), orgs: await prisma.organisation.count(), outbox: await prisma.outboxEvent.count() };
      console.log(`CLEANUP orgs=${orgs.length} remaining=${JSON.stringify(left)}`);
      expect(left).toEqual({ audit: 0, orgs: 0, outbox: 0 });
    } finally {
      await prisma.$disconnect();
      await pool.end();
    }
  });

  it("audit: the row is written in the caller's transaction, redacted, and disappears with a rollback", async () => {
    const org = bizId(); // no organisation row needed: audit has no foreign key
    await rolledBack(async (tx) => {
      const { id } = await writeAudit(tx, {
        action: "organisation.created",
        outcome: "done",
        initiator: { kind: "user", ref: "u1" },
        executor: { kind: "system", ref: "test" },
        organisationId: org,
        subject: { type: "organisation", id: org },
        payload: { name: "X", inviteToken: "abc", nested: { passwordHash: "h" } },
        before: { otp: "123456" },
      });
      const row = await tx.auditLog.findUniqueOrThrow({ where: { id } });
      expect(row.payload).toEqual({ name: "X", inviteToken: "[redacted]", nested: { passwordHash: "[redacted]" } });
      expect(row.before).toEqual({ otp: "[redacted]" });
      expect(row.organisationId).toBe(org);
    });
    expect(await auditCount()).toBe(0);
  });

  it("audit: a user-level event has no organisation", async () => {
    await rolledBack(async (tx) => {
      const { id } = await writeAudit(tx, { action: "user.linked", outcome: "done", initiator: { kind: "user", ref: "u" }, executor: { kind: "user", ref: "u" } });
      expect((await tx.auditLog.findUniqueOrThrow({ where: { id } })).organisationId).toBeNull();
    });
    expect(await auditCount()).toBe(0);
  });

  it("outbox: a rollback consumes no sequence number, and the next committed event gets the next one", async () => {
    const org = await newOrg();
    await rolledBack(async (tx) => {
      const e = await enqueueOutbox(tx, { organisationId: org, productKey: "alpha", eventType: "membership.changed", payload: { v: 1 } });
      expect(e.sequence).toBe(BigInt(1));
    });
    expect(await counter(org)).toBe(BigInt(0));
    expect(await outboxFor(org)).toHaveLength(0);
    const committed = await prisma.$transaction((tx) => enqueueOutbox(tx, { organisationId: org, productKey: "alpha", eventType: "membership.changed", payload: { v: 2 } }));
    expect(committed.sequence).toBe(BigInt(1));
    expect(await counter(org)).toBe(BigInt(1));
    const rows = await outboxFor(org);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ eventId: committed.eventId, productKey: "alpha", status: "pending", attempts: 0 });
  });

  it("outbox: one allocation serves two products; the event ids differ and both rows share the sequence", async () => {
    const org = await newOrg();
    await prisma.$transaction(async (tx) => {
      const sequence = await allocateOutboxSequence(tx, org);
      await enqueueOutbox(tx, { organisationId: org, productKey: "alpha", eventType: "x", payload: {}, sequence });
      await enqueueOutbox(tx, { organisationId: org, productKey: "beta", eventType: "x", payload: {}, sequence });
    });
    const rows = await outboxFor(org);
    expect(rows.map((r) => [r.productKey, r.sequence])).toEqual([["alpha", BigInt(1)], ["beta", BigInt(1)]]);
    expect(await counter(org)).toBe(BigInt(1));
  });

  it("outbox: the database refuses a duplicate (organisation, product, sequence) and the whole transaction rolls back", async () => {
    const org = await newOrg();
    await prisma.$transaction((tx) => enqueueOutbox(tx, { organisationId: org, productKey: "alpha", eventType: "x", payload: {} }));
    await expect(
      prisma.$transaction((tx) => enqueueOutbox(tx, { organisationId: org, productKey: "alpha", eventType: "x", payload: {}, sequence: BigInt(1) })),
    ).rejects.toThrow();
    expect(await outboxFor(org)).toHaveLength(1);
  });

  it("outbox: a missing organisation is named, and nothing is written", async () => {
    await expect(prisma.$transaction((tx) => enqueueOutbox(tx, { organisationId: bizId(), productKey: "alpha", eventType: "x", payload: {} }))).rejects.toThrow(/does not exist/);
  });

  it("outbox: a second transaction waits for the first, and sequence order equals commit order", async () => {
    const org = await newOrg();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let firstHolds!: () => void;
    const firstHolding = new Promise<void>((r) => (firstHolds = r));
    let secondDone = false;
    const first = prisma.$transaction(async (tx) => {
      const e = await enqueueOutbox(tx, { organisationId: org, productKey: "alpha", eventType: "first", payload: {} });
      firstHolds();
      await gate;
      return e;
    });
    await firstHolding;
    const second = prisma.$transaction(async (tx) => enqueueOutbox(tx, { organisationId: org, productKey: "alpha", eventType: "second", payload: {} })).then((e) => {
      secondDone = true;
      return e;
    });
    await new Promise((r) => setTimeout(r, 400));
    expect(secondDone, "the second allocation must wait on the first's row lock").toBe(false);
    release();
    const [a, b] = await Promise.all([first, second]);
    expect([a.sequence, b.sequence]).toEqual([BigInt(1), BigInt(2)]);
  });

  it("outbox: 15 concurrent transactions get 15 distinct, gap-free sequences, even when some roll back", async () => {
    const org = await newOrg();
    const results = await Promise.allSettled(
      Array.from({ length: 15 }, (_, i) =>
        prisma.$transaction(async (tx) => {
          const e = await enqueueOutbox(tx, { organisationId: org, productKey: "alpha", eventType: "x", payload: { i } });
          if (i % 5 === 4) throw new Rollback();
          return e.sequence;
        }),
      ),
    );
    const ok = results.filter((r): r is PromiseFulfilledResult<bigint> => r.status === "fulfilled").map((r) => r.value);
    expect(ok).toHaveLength(12);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(3);
    const sorted = [...ok].sort((a, b) => Number(a - b));
    expect(sorted).toEqual(Array.from({ length: 12 }, (_, i) => BigInt(i + 1)));
    expect(await counter(org)).toBe(BigInt(12));
    expect((await outboxFor(org)).map((r) => r.sequence)).toEqual(sorted);
  });
});
