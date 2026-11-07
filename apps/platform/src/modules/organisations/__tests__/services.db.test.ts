import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { loadCredentials, openGuarded, type Credentials } from "../../../lib/migration-roundtrip/__tests__/db-target";
import { writeAudit } from "../../audit/write-audit";
import { countUsers, createTestUser } from "../../users/__tests__/fixtures";
import { adoptOrganisation, createOrganisation, getLinkState, linkProduct, lockOrganisation, replaceAdmin, setStatus, unlinkProduct, type Context, type Refusal, type Result } from "..";
import { OneOrganisationPerTransactionError, OrganisationNotFoundError } from "../errors";

// F3.2.2 services against the real isolated Stage 2 PostgreSQL. Audit rows can never be deleted, so every scenario runs in a transaction that is
// rolled back; "commit" is simulated with SET CONSTRAINTS ALL IMMEDIATE, which fires the deferred checks exactly as COMMIT does. The only rows ever
// committed are plain organisation rows in the lock test (no audit), removed by exact id.
const credentials = loadCredentials(process.env.PLATFORM_TEST_CREDENTIALS_DIR);
class Rollback extends Error {}
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
const ctx: Context = { initiator: { kind: "user", ref: "test-user" }, executor: { kind: "system", ref: "test" }, requestId: "req-1" };
const ok = <T>(r: Result<T>): Extract<Result<T>, { ok: true }> => {
  if (!r.ok) throw new Error(`expected success, got refusal ${r.code}`);
  return r;
};
const refusedWith = (r: Result<unknown>, code: string) => expect(r.ok ? "success" : (r as Refusal).code).toBe(code);

describe.skipIf(credentials === null)("F3.2.2 organisation services against the real database", () => {
  const creds = credentials as Credentials;
  let pool: Pool;
  let prisma: PrismaClient;
  const committedOrgs: string[] = [];

  const scenario = async (fn: (tx: Tx) => Promise<void>) => {
    const err = await prisma.$transaction(async (tx) => { await fn(tx); throw new Rollback(); }, { timeout: 20_000 }).catch((e: unknown) => e);
    if (!(err instanceof Rollback)) throw err;
  };
  /** What COMMIT does: fire every deferred constraint now. */
  const commitCheck = async (tx: Tx) => {
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
  };
  const audit = (tx: Tx, orgId: string | null) => tx.auditLog.findMany({ where: { organisationId: orgId }, orderBy: { occurredAt: "asc" } });
  const auditOf = async (tx: Tx, orgId: string, action: string, outcome = "done") => (await audit(tx, orgId)).filter((a) => a.action === action && a.outcome === outcome);
  const events = (tx: Tx, orgId: string) => tx.outboxEvent.findMany({ where: { organisationId: orgId }, orderBy: [{ sequence: "asc" }, { productKey: "asc" }] });
  const newUser = (tx: Tx) => createTestUser(tx);
  let keyCounter = 0;
  const key = () => `idem-key-${Date.now()}-${keyCounter++}`;
  const create = async (tx: Tx, userId: string, productKey = "alpha", name = "Acme Catering") => ok(await createOrganisation(tx, ctx, { userId, idempotencyKey: key(), name, productKey })).organisationId;

  /**
   * A person holding a product in ANOTHER business, seeded directly (a service transaction may change only one organisation). The membership is a disabled one:
   * a disabled member keeps the slot (C8), and one person can be the ACTIVE Admin of only one business (20261107160000), so this is how a person comes to hold
   * a product elsewhere while the slot rule is the one under test.
   */
  const seedHolding = async (tx: Tx, userId: string, productKey: string) => {
    const orgId = `biz_${randomBytes(16).toString("hex")}`;
    await tx.organisation.create({ data: { id: orgId, name: "Elsewhere" } });
    await tx.organisationProduct.create({ data: { organisationId: orgId, productKey } });
    const m = await tx.organisationMember.create({ data: { organisationId: orgId, userId, centralRole: "admin", status: "disabled" }, select: { id: true } });
    const slot = await tx.membershipProductSlot.create({ data: { userId, productKey, organisationId: orgId, memberId: m.id }, select: { slotId: true } });
    await writeAudit(tx, { action: "slot.allocated", outcome: "done", initiator: ctx.initiator, executor: ctx.executor, organisationId: orgId, subject: { type: "slot", id: slot.slotId } });
  };

  beforeAll(async () => {
    const target = await openGuarded(creds, { applicationName: "platform-f322-guard" });
    await target.close();
    pool = new Pool({ connectionString: creds.url(), max: 10, application_name: "platform-f322" });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    expect(await prisma.auditLog.count(), "audit_logs must be empty before the test").toBe(0);
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.organisation.deleteMany({ where: { id: { in: committedOrgs } } });
      const left = { audit: await prisma.auditLog.count(), orgs: await prisma.organisation.count(), users: await countUsers(prisma), outbox: await prisma.outboxEvent.count() };
      console.log(`CLEANUP committed-orgs=${committedOrgs.length} remaining=${JSON.stringify(left)}`);
      expect(left).toEqual({ audit: 0, orgs: 0, users: 0, outbox: 0 });
    } finally {
      await prisma.$disconnect();
      await pool.end();
    }
  });

  it("runs at READ COMMITTED (the isolation the database triggers rely on)", () =>
    scenario(async (tx) => {
      expect((await tx.$queryRawUnsafe<{ transaction_isolation: string }[]>("show transaction_isolation"))[0].transaction_isolation).toBe("read committed");
    }));

  describe("createOrganisation (O1)", () => {
    it("creates the business, link, first Admin, slot, one audit row and the events, and commits cleanly", () =>
      scenario(async (tx) => {
        const user = await newUser(tx);
        const id = await create(tx, user);
        expect(id).toMatch(/^biz_[0-9a-f]{32}$/);
        const org = await tx.organisation.findUniqueOrThrow({ where: { id } });
        expect(org).toMatchObject({ name: "Acme Catering", status: "active", adminEstablished: true, linkEstablished: true, membershipVersion: BigInt(1) });
        const members = await tx.organisationMember.findMany({ where: { organisationId: id } });
        expect(members).toHaveLength(1);
        expect(members[0]).toMatchObject({ userId: user, centralRole: "admin", status: "active" });
        expect(await tx.membershipProductSlot.findMany({ where: { organisationId: id } })).toMatchObject([{ userId: user, productKey: "alpha", memberId: members[0].id }]);
        expect(await auditOf(tx, id, "organisation.created")).toHaveLength(1);
        expect(await auditOf(tx, id, "slot.allocated")).toHaveLength(1);
        const evs = await events(tx, id);
        expect(evs).toHaveLength(1);
        expect(evs[0]).toMatchObject({ productKey: "alpha", eventType: "membership.changed", sequence: BigInt(1), payload: { userId: user, role: "admin", status: "active", membershipVersion: 1 } });
        await commitCheck(tx);
      }));

    it("the same idempotency key returns the stored business with no new rows; a different request with that key is refused", () =>
      scenario(async (tx) => {
        const user = await newUser(tx);
        const k = key();
        const first = ok(await createOrganisation(tx, ctx, { userId: user, idempotencyKey: k, name: "Same Name", productKey: "alpha" }));
        const again = ok(await createOrganisation(tx, ctx, { userId: user, idempotencyKey: k, name: "  same   NAME ", productKey: "alpha" }));
        expect(again).toMatchObject({ organisationId: first.organisationId, created: false });
        expect(await tx.organisation.count()).toBe(1);
        expect(await auditOf(tx, first.organisationId, "organisation.created")).toHaveLength(1);
        refusedWith(await createOrganisation(tx, ctx, { userId: user, idempotencyKey: k, name: "Other Name", productKey: "alpha" }), "idempotency_conflict");
        expect(await tx.organisation.count()).toBe(1);
      }));

    it("refuses an unknown, disabled or unverified person, with one refused audit row each and nothing created", () =>
      scenario(async (tx) => {
        const disabled = await createTestUser(tx, { status: "disabled" });
        const unverified = await createTestUser(tx, { verified: false });
        refusedWith(await createOrganisation(tx, ctx, { userId: "00000000-0000-4000-8000-000000000000", idempotencyKey: key(), name: "X", productKey: "alpha" }), "user_not_found");
        refusedWith(await createOrganisation(tx, ctx, { userId: disabled, idempotencyKey: key(), name: "X", productKey: "alpha" }), "user_not_active");
        refusedWith(await createOrganisation(tx, ctx, { userId: unverified, idempotencyKey: key(), name: "X", productKey: "alpha" }), "email_not_verified");
        expect(await tx.organisation.count()).toBe(0);
        expect((await audit(tx, null)).map((a) => [a.action, a.outcome, a.reasonCode])).toEqual([
          ["organisation.created", "refused", "user_not_found"],
          ["organisation.created", "refused", "user_not_active"],
          ["organisation.created", "refused", "email_not_verified"],
        ]);
      }));

    it("refuses a person who already holds the product elsewhere, but not a different product", () =>
      scenario(async (tx) => {
        const user = await newUser(tx);
        await seedHolding(tx, user, "alpha");
        refusedWith(await createOrganisation(tx, ctx, { userId: user, idempotencyKey: key(), name: "Second", productKey: "alpha" }), "slot_taken");
        expect(await tx.organisation.count()).toBe(1);
        await create(tx, user, "beta", "Second");
        expect(await tx.organisation.count()).toBe(2);
      }));

    it("rejects invalid input before touching the database", async () => {
      await scenario(async (tx) => {
        const user = await newUser(tx);
        await expect(createOrganisation(tx, ctx, { userId: user, idempotencyKey: "short", name: "X", productKey: "alpha" })).rejects.toThrow(/idempotency/);
        await expect(createOrganisation(tx, ctx, { userId: user, idempotencyKey: key(), name: "   ", productKey: "alpha" })).rejects.toThrow(/name/);
        await expect(createOrganisation(tx, ctx, { userId: user, idempotencyKey: key(), name: "X", productKey: "Bad Key" })).rejects.toThrow(/product key/);
      });
    });
  });

  describe("adoptOrganisation and replaceAdmin", () => {
    it("an adopted business is unclaimed (no Admin, no link, not established) and commits", () =>
      scenario(async (tx) => {
        const { organisationId } = ok(await adoptOrganisation(tx, ctx, { name: "Imported Co", importBatchId: "batch-1" }));
        expect(await tx.organisation.findUniqueOrThrow({ where: { id: organisationId } })).toMatchObject({ adminEstablished: false, linkEstablished: false, importBatchId: "batch-1" });
        expect(await auditOf(tx, organisationId, "organisation.adopted")).toHaveLength(1);
        await commitCheck(tx);
      }));

    it("the first appointment (expected none) establishes the business, and a second first-appointment is refused", () =>
      scenario(async (tx) => {
        const { organisationId } = ok(await adoptOrganisation(tx, ctx, { name: "Imported Co" }));
        const [a, b] = [await newUser(tx), await newUser(tx)];
        const first = ok(await replaceAdmin(tx, ctx, { organisationId, expectedPreviousMemberId: null, newUserId: a }));
        expect(first.previous).toBeNull();
        expect((await tx.organisation.findUniqueOrThrow({ where: { id: organisationId } })).adminEstablished).toBe(true);
        refusedWith(await replaceAdmin(tx, ctx, { organisationId, expectedPreviousMemberId: null, newUserId: b }), "admin_exists");
        await commitCheck(tx);
      }));

    it("replaces the Admin atomically: old row disabled and kept, new row active, version bumped, no slot touched, one audit row, floor holds at commit", () =>
      scenario(async (tx) => {
        const [a, b] = [await newUser(tx), await newUser(tx)];
        const id = await create(tx, a);
        const before = await tx.organisationMember.findFirstOrThrow({ where: { organisationId: id } });
        const slotsBefore = await tx.membershipProductSlot.findMany({ where: { organisationId: id } });
        const swap = ok(await replaceAdmin(tx, ctx, { organisationId: id, expectedPreviousMemberId: before.id, newUserId: b }));
        expect(swap.previous).toEqual({ memberId: before.id, userId: a });
        const rows = await tx.organisationMember.findMany({ where: { organisationId: id }, orderBy: { createdAt: "asc" } });
        expect(rows.map((r) => [r.userId, r.status])).toEqual([[a, "disabled"], [b, "active"]]);
        expect(await tx.membershipProductSlot.findMany({ where: { organisationId: id } })).toEqual(slotsBefore);
        expect(await auditOf(tx, id, "admin.replaced")).toHaveLength(1);
        expect(Number((await tx.organisation.findUniqueOrThrow({ where: { id } })).membershipVersion)).toBe(2);
        const evs = (await events(tx, id)).filter((e) => (e.payload as { membershipVersion: number }).membershipVersion === 2);
        expect(evs.map((e) => (e.payload as { userId: string; status: string }).status).sort()).toEqual(["active", "disabled"]);
        await commitCheck(tx);
      }));

    it("refuses a stale expected Admin, the same person, and reappointing a former Admin (P6), each with a refused audit row and no change", () =>
      scenario(async (tx) => {
        const [a, b, c] = [await newUser(tx), await newUser(tx), await newUser(tx)];
        const id = await create(tx, a);
        const first = await tx.organisationMember.findFirstOrThrow({ where: { organisationId: id } });
        refusedWith(await replaceAdmin(tx, ctx, { organisationId: id, expectedPreviousMemberId: first.id, newUserId: a }), "same_admin");
        refusedWith(await replaceAdmin(tx, ctx, { organisationId: id, expectedPreviousMemberId: "11111111-1111-4111-8111-111111111111", newUserId: b }), "admin_mismatch");
        const second = ok(await replaceAdmin(tx, ctx, { organisationId: id, expectedPreviousMemberId: first.id, newUserId: b }));
        refusedWith(await replaceAdmin(tx, ctx, { organisationId: id, expectedPreviousMemberId: first.id, newUserId: c }), "admin_mismatch");
        refusedWith(await replaceAdmin(tx, ctx, { organisationId: id, expectedPreviousMemberId: second.current.memberId, newUserId: a }), "former_admin_reappointment_not_decided");
        expect((await tx.organisationMember.findMany({ where: { organisationId: id, status: "active" } })).map((m) => m.userId)).toEqual([b]);
        expect((await auditOf(tx, id, "admin.replaced", "refused")).map((r) => r.reasonCode)).toEqual(["same_admin", "admin_mismatch", "admin_mismatch", "former_admin_reappointment_not_decided"]);
        await commitCheck(tx);
      }));
  });

  describe("linkProduct and unlinkProduct", () => {
    it("link: every non-removed member takes a slot (a disabled former Admin too), one audit row, version bumped, events to that product only", () =>
      scenario(async (tx) => {
        const [a, b] = [await newUser(tx), await newUser(tx)];
        const id = await create(tx, a);
        const first = await tx.organisationMember.findFirstOrThrow({ where: { organisationId: id } });
        ok(await replaceAdmin(tx, ctx, { organisationId: id, expectedPreviousMemberId: first.id, newUserId: b }));
        const link = ok(await linkProduct(tx, ctx, { organisationId: id, productKey: "beta" }));
        expect(link).toMatchObject({ changed: true, slots: 2 });
        expect((await tx.membershipProductSlot.findMany({ where: { organisationId: id, productKey: "beta" } })).map((s) => s.userId).sort()).toEqual([a, b].sort());
        expect(await auditOf(tx, id, "product.linked")).toHaveLength(1);
        expect(await auditOf(tx, id, "slot.allocated")).toHaveLength(3);
        const betaEvents = (await events(tx, id)).filter((e) => e.productKey === "beta");
        expect(betaEvents.map((e) => (e.payload as { status: string }).status).sort()).toEqual(["active", "disabled"]);
        expect(await getLinkState(tx, id, "beta")).toEqual({ state: "linked" });
        await commitCheck(tx);
      }));

    it("link: already linked changes nothing and writes nothing", () =>
      scenario(async (tx) => {
        const id = await create(tx, await newUser(tx));
        const auditBefore = (await audit(tx, id)).length;
        const eventsBefore = (await events(tx, id)).length;
        expect(ok(await linkProduct(tx, ctx, { organisationId: id, productKey: "alpha" }))).toMatchObject({ changed: false });
        expect((await audit(tx, id)).length).toBe(auditBefore);
        expect((await events(tx, id)).length).toBe(eventsBefore);
      }));

    it("link: refused as a whole, counts only, when a member already holds the product in another business", () =>
      scenario(async (tx) => {
        const a = await newUser(tx);
        const id = await create(tx, a, "alpha", "First");
        await seedHolding(tx, a, "beta");
        const r = await linkProduct(tx, ctx, { organisationId: id, productKey: "beta" });
        refusedWith(r, "slot_taken");
        expect((r as Refusal).detail).toEqual({ people: 1 });
        expect(await getLinkState(tx, id, "beta")).toEqual({ state: "never_linked" });
        expect(await tx.membershipProductSlot.count({ where: { organisationId: id, productKey: "beta" } })).toBe(0);
        expect(await auditOf(tx, id, "product.linked", "refused")).toHaveLength(1);
      }));

    it("unlink (clarification D): slots released with their events, tombstone written, one audit row, removal events to that product, memberships untouched, link state answers, relink closes the tombstone", () =>
      scenario(async (tx) => {
        const a = await newUser(tx);
        const id = await create(tx, a);
        ok(await linkProduct(tx, ctx, { organisationId: id, productKey: "beta" }));
        const memberBefore = await tx.organisationMember.findFirstOrThrow({ where: { organisationId: id } });
        const versionBefore = Number((await tx.organisation.findUniqueOrThrow({ where: { id } })).membershipVersion);
        const un = ok(await unlinkProduct(tx, ctx, { organisationId: id, productKey: "beta" }));
        expect(un).toMatchObject({ changed: true, slots: 1 });
        expect(await tx.membershipProductSlot.count({ where: { organisationId: id, productKey: "beta" } })).toBe(0);
        expect(await tx.membershipProductSlot.count({ where: { organisationId: id, productKey: "alpha" } })).toBe(1);
        expect(await tx.organisationMember.findFirstOrThrow({ where: { organisationId: id } })).toEqual(memberBefore);
        const unlinkAudit = await auditOf(tx, id, "product.unlinked");
        expect(unlinkAudit).toHaveLength(1);
        expect(unlinkAudit[0].before).toMatchObject({ productKey: "beta", slotCount: 1, memberIds: [memberBefore.id] });
        expect(await auditOf(tx, id, "slot.released")).toHaveLength(1);
        const removed = (await events(tx, id)).filter((e) => e.productKey === "beta" && (e.payload as { status: string }).status === "removed");
        expect(removed).toHaveLength(1);
        expect((removed[0].payload as { membershipVersion: number }).membershipVersion).toBe(versionBefore + 1);
        const state = await getLinkState(tx, id, "beta");
        expect(state).toMatchObject({ state: "unlinked" });
        const tomb = await tx.organisationProductUnlink.findFirstOrThrow({ where: { organisationId: id, productKey: "beta" } });
        expect(tomb).toMatchObject({ unlinkedBy: "test", relinkedAt: null });
        expect(tomb.organisationSequence).toBe((await tx.organisation.findUniqueOrThrow({ where: { id } })).outboxSequence);
        await commitCheck(tx);
        // Idempotent: the second unlink changes nothing and writes nothing.
        const auditCount = (await audit(tx, id)).length;
        expect(ok(await unlinkProduct(tx, ctx, { organisationId: id, productKey: "beta" }))).toMatchObject({ changed: false });
        expect((await audit(tx, id)).length).toBe(auditCount);
        // Relink restores the slot and closes the tombstone.
        expect(ok(await linkProduct(tx, ctx, { organisationId: id, productKey: "beta" }))).toMatchObject({ changed: true, slots: 1 });
        expect((await tx.organisationProductUnlink.findUniqueOrThrow({ where: { id: tomb.id } })).relinkedAt).not.toBeNull();
        expect(await getLinkState(tx, id, "beta")).toEqual({ state: "linked" });
        await commitCheck(tx);
      }));

    it("unlink: the last link is refused (audited) and nothing changes", () =>
      scenario(async (tx) => {
        const id = await create(tx, await newUser(tx));
        refusedWith(await unlinkProduct(tx, ctx, { organisationId: id, productKey: "alpha" }), "last_link");
        expect(await tx.organisationProduct.count({ where: { organisationId: id } })).toBe(1);
        expect(await tx.membershipProductSlot.count({ where: { organisationId: id } })).toBe(1);
        expect(await auditOf(tx, id, "product.unlinked", "refused")).toHaveLength(1);
        await commitCheck(tx);
      }));

    it("getLinkState says never_linked for a product that was never linked", () =>
      scenario(async (tx) => {
        const id = await create(tx, await newUser(tx));
        expect(await getLinkState(tx, id, "gamma")).toEqual({ state: "never_linked" });
      }));
  });

  describe("setStatus", () => {
    it("changes the status with one audit row and one event per linked product sharing one sequence; the same status is a no-op", () =>
      scenario(async (tx) => {
        const id = await create(tx, await newUser(tx));
        ok(await linkProduct(tx, ctx, { organisationId: id, productKey: "beta" }));
        const before = (await events(tx, id)).length;
        expect(ok(await setStatus(tx, ctx, { organisationId: id, status: "suspended" }))).toMatchObject({ changed: true });
        expect((await tx.organisation.findUniqueOrThrow({ where: { id } })).status).toBe("suspended");
        const st = (await events(tx, id)).filter((e) => e.eventType === "organisation.status");
        expect(st.map((e) => [e.productKey, e.payload])).toEqual([["alpha", { status: "suspended" }], ["beta", { status: "suspended" }]]);
        expect(st[0].sequence).toBe(st[1].sequence);
        expect((await events(tx, id)).length).toBe(before + 2);
        expect(await auditOf(tx, id, "organisation.status_changed")).toHaveLength(1);
        const count = (await audit(tx, id)).length;
        expect(ok(await setStatus(tx, ctx, { organisationId: id, status: "suspended" }))).toMatchObject({ changed: false });
        expect((await audit(tx, id)).length).toBe(count);
        await commitCheck(tx);
      }));
  });

  describe("lockOrganisation", () => {
    it("names a missing organisation", () =>
      scenario(async (tx) => {
        await expect(lockOrganisation(tx, "biz_" + "0".repeat(32))).rejects.toBeInstanceOf(OrganisationNotFoundError);
      }));

    it("refuses a second, different organisation in the same transaction (one transaction changes one organisation)", async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          ok(await adoptOrganisation(tx, ctx, { name: "One" }));
          ok(await adoptOrganisation(tx, ctx, { name: "Two" }));
        }),
      ).rejects.toBeInstanceOf(OneOrganisationPerTransactionError);
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it("a second transaction waits for the first's row lock and proceeds when it ends", async () => {
      const id = `biz_${"c".repeat(32)}`;
      await prisma.organisation.create({ data: { id, name: "Lock Test" } });
      committedOrgs.push(id);
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let held!: () => void;
      const holding = new Promise<void>((r) => (held = r));
      let secondGotLock = false;
      const first = prisma.$transaction(async (tx) => {
        await lockOrganisation(tx, id);
        held();
        await gate;
        throw new Rollback();
      });
      await holding;
      const second = prisma.$transaction(async (tx) => {
        await lockOrganisation(tx, id);
        secondGotLock = true;
        throw new Rollback();
      });
      await new Promise((r) => setTimeout(r, 400));
      expect(secondGotLock, "the second transaction must wait for the lock").toBe(false);
      release();
      await expect(first).rejects.toBeInstanceOf(Rollback);
      await expect(second).rejects.toBeInstanceOf(Rollback);
      expect(secondGotLock).toBe(true);
    });
  });

  describe("static guards", () => {
    const SRC = path.resolve(__dirname, "../../..");
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "generated" && e.name !== "node_modules") walk(full, out);
        } else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
      }
      return out;
    };
    const files = walk(SRC).map((f) => [path.relative(SRC, f).split(path.sep).join("/"), readFileSync(f, "utf8")] as const);

    it("I-6: only modules/organisations/admin.ts writes organisation member rows (tests aside)", () => {
      const WRITE = /organisationMember\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b|\b(insert\s+into|update|delete\s+from)\s+"?organisation_members"?/i;
      const offenders = files.filter(([f, text]) => !f.includes("__tests__/") && f !== "modules/organisations/admin.ts" && !f.startsWith("lib/migration-roundtrip/") && WRITE.test(text)).map(([f]) => f);
      expect(offenders).toEqual([]);
    });

    it("services never open a transaction or import the global client", () => {
      const offenders = files.filter(([f, text]) => f.startsWith("modules/organisations/") && !f.includes("__tests__/") && /\$transaction|@\/lib\/db/.test(text)).map(([f]) => f);
      expect(offenders).toEqual([]);
    });
  });
});
