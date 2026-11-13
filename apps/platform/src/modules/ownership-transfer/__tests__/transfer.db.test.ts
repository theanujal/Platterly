import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { createOrganisation, type Context, type Refusal, type Result } from "../../organisations";
import { createTestUser, emailOfUser, insertUser, setEmailVerified } from "../../users/__tests__/fixtures";
import { acceptTransfer, cancelTransfer, declineTransfer, expireTransfer, startTransfer, TRANSFER_TTL_DAYS, type Guards } from "..";

// Admin transfer against the real F4 Platform test database. Audit rows can never be deleted, so every scenario runs in a transaction that is rolled back;
// "commit" is simulated with SET CONSTRAINTS ALL IMMEDIATE (fires the deferred Admin-floor and slot checks exactly as COMMIT does). Nothing is committed.
const url = process.env.PLATFORM_F4_TEST_DATABASE_URL;
class Rollback extends Error {}
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
const ctx: Context = { initiator: { kind: "user", ref: "test-user" }, executor: { kind: "system", ref: "test" }, requestId: "req-t" };
const clear: Guards = { adminEmailChangeOpen: false, adminOnHold: false };
const ok = <T>(r: Result<T>): Extract<Result<T>, { ok: true }> => {
  if (!r.ok) throw new Error(`expected success, got refusal ${r.code}`);
  return r;
};
const code = (r: Result<unknown>) => (r.ok ? "success" : (r as Refusal).code);
const DAY = 86_400_000;

describe.skipIf(!url)("Admin transfer against the real Platform test database", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  beforeAll(() => {
    const u = new URL(url as string);
    u.search = "";
    pool = new Pool({ connectionString: u.toString(), max: 5 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  const scenario = async (fn: (tx: Tx) => Promise<void>) => {
    const err = await prisma.$transaction(async (tx) => { await fn(tx); throw new Rollback(); }, { timeout: 30_000 }).catch((e: unknown) => e);
    if (!(err instanceof Rollback)) throw err;
  };
  const commitCheck = async (tx: Tx) => {
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
  };
  const emailOf = emailOfUser;
  let k = 0;
  /** A business with its Admin, plus a nominee person (account exists, verified, belongs nowhere). */
  const setup = async (tx: Tx) => {
    const admin = await createTestUser(tx);
    const organisationId = ok(await createOrganisation(tx, ctx, { userId: admin, idempotencyKey: `transfer-key-${Date.now()}-${k++}`, name: "Acme Catering", productKey: "alpha" })).organisationId;
    const nominee = await createTestUser(tx);
    return { admin, nominee, organisationId, nomineeEmail: await emailOf(tx, nominee) };
  };
  const start = async (tx: Tx, s: Awaited<ReturnType<typeof setup>>, extra: Partial<Parameters<typeof startTransfer>[2]> = {}) =>
    ok(await startTransfer(tx, ctx, { organisationId: s.organisationId, adminUserId: s.admin, nomineeEmail: s.nomineeEmail, guards: clear, ...extra }));
  const auditOf = async (tx: Tx, organisationId: string, action: string, outcome = "done") => (await tx.auditLog.findMany({ where: { organisationId, action, outcome } }));

  describe("start", () => {
    it("stores only a hash of the secret, expires in 7 days, writes one audit row", () =>
      scenario(async (tx) => {
        const s = await setup(tx);
        const now = new Date("2026-11-13T10:00:00Z");
        const t = await start(tx, s, { now });
        const row = await tx.ownershipTransfer.findUniqueOrThrow({ where: { id: t.transferId } });
        expect(row).toMatchObject({ status: "pending", nomineeEmail: s.nomineeEmail, resolvedAt: null });
        expect(row.tokenHash).not.toContain(t.token);
        expect(row.expiresAt.getTime()).toBe(now.getTime() + TRANSFER_TTL_DAYS * DAY);
        expect(await auditOf(tx, s.organisationId, "ownership.started")).toHaveLength(1);
        expect(JSON.stringify((await auditOf(tx, s.organisationId, "ownership.started"))[0])).not.toContain(t.token);
        await commitCheck(tx);
      }));

    it("is refused for a person who is not the Admin, a locked, suspended or held business, an open email change, a pending transfer, oneself", () =>
      scenario(async (tx) => {
        const s = await setup(tx);
        const other = await createTestUser(tx);
        const refuse = async (extra: Partial<Parameters<typeof startTransfer>[2]>) => code(await startTransfer(tx, ctx, { organisationId: s.organisationId, adminUserId: s.admin, nomineeEmail: s.nomineeEmail, guards: clear, ...extra }));
        expect(await refuse({ adminUserId: other })).toBe("not_the_admin");
        expect(await refuse({ guards: { ...clear, adminOnHold: true } })).toBe("account_on_hold");
        expect(await refuse({ guards: { ...clear, adminEmailChangeOpen: true } })).toBe("email_change_open");
        expect(await refuse({ nomineeEmail: await emailOf(tx, s.admin) })).toBe("nominee_is_self");
        await tx.organisation.update({ where: { id: s.organisationId }, data: { ownershipLocked: true } });
        expect(await refuse({})).toBe("ownership_locked");
        await tx.organisation.update({ where: { id: s.organisationId }, data: { ownershipLocked: false, status: "suspended" } });
        expect(await refuse({})).toBe("organisation_not_active");
        await tx.organisation.update({ where: { id: s.organisationId }, data: { status: "active" } });
        await start(tx, s);
        expect(await refuse({})).toBe("transfer_pending");
        expect(await tx.ownershipTransfer.count({ where: { organisationId: s.organisationId } })).toBe(1);
        expect((await auditOf(tx, s.organisationId, "ownership.started", "refused")).map((a) => a.reasonCode)).toEqual(["not_the_admin", "account_on_hold", "email_change_open", "nominee_is_self", "ownership_locked", "organisation_not_active", "transfer_pending"]);
        await commitCheck(tx);
      }));

    it("is refused when the nominee already belongs to any business or holds a place, and the invitation to someone with no account works", () =>
      scenario(async (tx) => {
        const s = await setup(tx);
        const elsewhere = `biz_${randomBytes(16).toString("hex")}`;
        await tx.organisation.create({ data: { id: elsewhere, name: "Elsewhere" } });
        await tx.organisationMember.create({ data: { organisationId: elsewhere, userId: s.nominee, centralRole: "admin", status: "disabled" } });
        expect(code(await startTransfer(tx, ctx, { organisationId: s.organisationId, adminUserId: s.admin, nomineeEmail: s.nomineeEmail, guards: clear }))).toBe("nominee_holds_a_slot");
        const fresh = ok(await startTransfer(tx, ctx, { organisationId: s.organisationId, adminUserId: s.admin, nomineeEmail: "  New.Person@Example.COM ", guards: clear }));
        expect(fresh.nomineeEmail).toBe("new.person@example.com");
      }));

    it("an invitation that ran out is recorded as expired and a new one can be sent", () =>
      scenario(async (tx) => {
        const s = await setup(tx);
        const first = await start(tx, s, { now: new Date("2026-11-01T00:00:00Z") });
        const second = await start(tx, s, { now: new Date("2026-11-20T00:00:00Z") });
        expect((await tx.ownershipTransfer.findUniqueOrThrow({ where: { id: first.transferId } })).status).toBe("expired");
        expect((await tx.ownershipTransfer.findUniqueOrThrow({ where: { id: second.transferId } })).status).toBe("pending");
        await commitCheck(tx);
      }));
  });

  describe("accept", () => {
    it("moves the Admin role, keeps the old Admin as an active former Admin with their places, gives the new Admin a place, and sends both events", () =>
      scenario(async (tx) => {
        const s = await setup(tx);
        const oldMember = await tx.organisationMember.findFirstOrThrow({ where: { organisationId: s.organisationId } });
        const t = await start(tx, s);
        const done = ok(await acceptTransfer(tx, ctx, { token: t.token, userId: s.nominee, guards: clear }));
        expect(done.formerAdminUserId).toBe(s.admin);
        const rows = await tx.organisationMember.findMany({ where: { organisationId: s.organisationId }, orderBy: { createdAt: "asc" } });
        expect(rows.map((r) => [r.userId, r.centralRole, r.status])).toEqual([[s.admin, "former_admin", "active"], [s.nominee, "admin", "active"]]);
        expect(rows[0].id).toBe(oldMember.id);
        const slots = await tx.membershipProductSlot.findMany({ where: { organisationId: s.organisationId, productKey: "alpha" } });
        expect(slots.map((x) => x.userId).sort()).toEqual([s.admin, s.nominee].sort());
        const events = (await tx.outboxEvent.findMany({ where: { organisationId: s.organisationId } })).map((e) => e.payload as { userId: string; role: string; status: string; membershipVersion: number }).filter((p) => p.membershipVersion === 2);
        expect(events.map((p) => [p.userId, p.role, p.status]).sort()).toEqual([[s.admin, "former_admin", "active"], [s.nominee, "admin", "active"]].sort());
        expect(await tx.ownershipTransfer.findUniqueOrThrow({ where: { id: t.transferId } })).toMatchObject({ status: "accepted", acceptedUserId: s.nominee });
        expect(await auditOf(tx, s.organisationId, "ownership.accepted")).toHaveLength(1);
        expect(await auditOf(tx, s.organisationId, "admin.replaced")).toHaveLength(1);
        await commitCheck(tx);
      }));

    it("a person who signs up through the invitation later can accept it; a second accept, a decline and a cancel afterwards are all refused", () =>
      scenario(async (tx) => {
        const s = await setup(tx);
        const t = ok(await startTransfer(tx, ctx, { organisationId: s.organisationId, adminUserId: s.admin, nomineeEmail: "later@example.com", guards: clear }));
        const later = await insertUser(tx, { email: "later@example.com" });
        ok(await acceptTransfer(tx, ctx, { token: t.token, userId: later.id, guards: clear }));
        expect(code(await acceptTransfer(tx, ctx, { token: t.token, userId: later.id, guards: clear }))).toBe("transfer_not_pending");
        expect(code(await declineTransfer(tx, ctx, { token: t.token, userId: later.id }))).toBe("transfer_not_pending");
        expect(code(await cancelTransfer(tx, ctx, { organisationId: s.organisationId, adminUserId: later.id }))).toBe("transfer_not_found");
        await commitCheck(tx);
      }));

    it("refuses the wrong person, an unverified address, and someone who gained a place after the invitation; the invitation stays pending", () =>
      scenario(async (tx) => {
        const s = await setup(tx);
        const t = await start(tx, s);
        const stranger = await createTestUser(tx);
        expect(code(await acceptTransfer(tx, ctx, { token: t.token, userId: stranger, guards: clear }))).toBe("nominee_email_mismatch");
        await setEmailVerified(tx, s.nominee, false);
        expect(code(await acceptTransfer(tx, ctx, { token: t.token, userId: s.nominee, guards: clear }))).toBe("nominee_email_mismatch");
        await setEmailVerified(tx, s.nominee, true);
        const elsewhere = `biz_${randomBytes(16).toString("hex")}`;
        await tx.organisation.create({ data: { id: elsewhere, name: "Elsewhere" } });
        await tx.organisationMember.create({ data: { organisationId: elsewhere, userId: s.nominee, centralRole: "admin", status: "disabled" } });
        expect(code(await acceptTransfer(tx, ctx, { token: t.token, userId: s.nominee, guards: clear }))).toBe("nominee_holds_a_slot");
        expect((await tx.ownershipTransfer.findUniqueOrThrow({ where: { id: t.transferId } })).status).toBe("pending");
        expect((await tx.organisationMember.findMany({ where: { organisationId: s.organisationId, status: "active" } })).map((m) => m.userId)).toEqual([s.admin]);
        await commitCheck(tx);
      }));

    it("is blocked by a lock, a hold, an open email change or a suspended business, but an expiry is still recorded", () =>
      scenario(async (tx) => {
        const s = await setup(tx);
        const t = await start(tx, s, { now: new Date("2026-11-13T00:00:00Z") });
        const soon = new Date("2026-11-14T00:00:00Z");
        const accept = async (guards: Guards = clear, now = soon) => code(await acceptTransfer(tx, ctx, { token: t.token, userId: s.nominee, guards, now }));
        expect(await accept({ ...clear, adminOnHold: true })).toBe("account_on_hold");
        expect(await accept({ ...clear, adminEmailChangeOpen: true })).toBe("email_change_open");
        await tx.organisation.update({ where: { id: s.organisationId }, data: { ownershipLocked: true } });
        expect(await accept()).toBe("ownership_locked");
        await tx.organisation.update({ where: { id: s.organisationId }, data: { ownershipLocked: false, status: "suspended" } });
        expect(await accept()).toBe("organisation_not_active");
        await tx.organisation.update({ where: { id: s.organisationId }, data: { ownershipLocked: true, status: "active" } });
        expect(await accept(clear, new Date("2026-12-01T00:00:00Z"))).toBe("transfer_expired");
        expect((await tx.ownershipTransfer.findUniqueOrThrow({ where: { id: t.transferId } })).status).toBe("expired");
        expect(await auditOf(tx, s.organisationId, "ownership.expired")).toHaveLength(1);
        expect(await accept()).toBe("transfer_not_pending");
        await commitCheck(tx);
      }));

    it("refuses when the Admin changed since the invitation (staff recovery in between)", () =>
      scenario(async (tx) => {
        const s = await setup(tx);
        const t = await start(tx, s);
        await tx.organisationMember.updateMany({ where: { organisationId: s.organisationId, userId: s.admin }, data: { status: "disabled" } });
        const third = await createTestUser(tx);
        await tx.organisationMember.create({ data: { organisationId: s.organisationId, userId: third, centralRole: "admin", status: "active" } });
        expect(code(await acceptTransfer(tx, ctx, { token: t.token, userId: s.nominee, guards: clear }))).toBe("admin_mismatch");
        await commitCheck(tx);
      }));

    it("an unknown or malformed link is not found", () =>
      scenario(async (tx) => {
        await expect(acceptTransfer(tx, ctx, { token: "nope", userId: await createTestUser(tx), guards: clear })).rejects.toThrow(/no transfer/);
        await expect(acceptTransfer(tx, ctx, { token: randomBytes(32).toString("base64url"), userId: await createTestUser(tx), guards: clear })).rejects.toThrow(/no transfer/);
      }));
  });

  describe("decline, cancel and expire", () => {
    it("the nominee declines (only the matching account) and the Admin can then invite again", () =>
      scenario(async (tx) => {
        const s = await setup(tx);
        const t = await start(tx, s);
        expect(code(await declineTransfer(tx, ctx, { token: t.token, userId: await createTestUser(tx) }))).toBe("nominee_email_mismatch");
        ok(await declineTransfer(tx, ctx, { token: t.token, userId: s.nominee }));
        expect((await tx.ownershipTransfer.findUniqueOrThrow({ where: { id: t.transferId } })).status).toBe("declined");
        expect(code(await acceptTransfer(tx, ctx, { token: t.token, userId: s.nominee, guards: clear }))).toBe("transfer_not_pending");
        await start(tx, s);
        await commitCheck(tx);
      }));

    it("only the Admin cancels, the link stops working, and nothing is cancelled when nothing is pending", () =>
      scenario(async (tx) => {
        const s = await setup(tx);
        expect(code(await cancelTransfer(tx, ctx, { organisationId: s.organisationId, adminUserId: s.admin }))).toBe("transfer_not_found");
        const t = await start(tx, s);
        expect(code(await cancelTransfer(tx, ctx, { organisationId: s.organisationId, adminUserId: s.nominee }))).toBe("not_the_admin");
        ok(await cancelTransfer(tx, ctx, { organisationId: s.organisationId, adminUserId: s.admin }));
        expect(code(await acceptTransfer(tx, ctx, { token: t.token, userId: s.nominee, guards: clear }))).toBe("transfer_not_pending");
        expect((await tx.organisationMember.findMany({ where: { organisationId: s.organisationId, status: "active" } })).map((m) => m.userId)).toEqual([s.admin]);
        await commitCheck(tx);
      }));

    it("the scheduled expiry records only invitations that are due", () =>
      scenario(async (tx) => {
        const s = await setup(tx);
        const t = await start(tx, s, { now: new Date("2026-11-13T00:00:00Z") });
        expect(await expireTransfer(tx, ctx, t.transferId, new Date("2026-11-14T00:00:00Z"))).toBe(false);
        expect(await expireTransfer(tx, ctx, t.transferId, new Date("2026-11-21T00:00:00Z"))).toBe(true);
        expect(await expireTransfer(tx, ctx, t.transferId, new Date("2026-11-22T00:00:00Z"))).toBe(false);
        await commitCheck(tx);
      }));
  });

  it("the database allows one pending transfer per business and rejects a pending row that has a resolved time", () =>
    scenario(async (tx) => {
      const s = await setup(tx);
      const member = await tx.organisationMember.findFirstOrThrow({ where: { organisationId: s.organisationId } });
      const base = { organisationId: s.organisationId, fromMemberId: member.id, nomineeEmail: "x@example.com", expiresAt: new Date(Date.now() + DAY) };
      await tx.ownershipTransfer.create({ data: { ...base, tokenHash: "h1" } });
      await tx.$executeRawUnsafe("SAVEPOINT a");
      await expect(tx.ownershipTransfer.create({ data: { ...base, tokenHash: "h2" } })).rejects.toThrow();
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT a");
      await expect(tx.ownershipTransfer.create({ data: { ...base, tokenHash: "h3", status: "declined" } })).rejects.toThrow();
    }));
});
