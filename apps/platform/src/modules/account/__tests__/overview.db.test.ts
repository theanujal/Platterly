import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { loadCredentials, openGuarded, type Credentials } from "../../../lib/migration-roundtrip/__tests__/db-target";
import { createOrganisation, linkProduct, replaceAdmin, setStatus, type Context } from "../../organisations";
import { writeAudit } from "../../audit/write-audit";
import { createTestUser } from "../../users/__tests__/fixtures";
import { loadAccountOverview, toResponse, type AccountDb } from "../overview";
import type { AccountOverview, OverviewResult } from "../types";
import { testSession } from "./session-fixture";

// The Account read-only data layer against the real isolated Stage 2 PostgreSQL. Identity is a test-injected Session value. Every scenario runs
// in a rolled-back transaction (audit rows can never be deleted), and the database must be empty before and after.
const credentials = loadCredentials(process.env.PLATFORM_TEST_CREDENTIALS_DIR);
class Rollback extends Error {}
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
const ctx: Context = { initiator: { kind: "user", ref: "t" }, executor: { kind: "system", ref: "t" } };
let counter = 0;
const key = () => `acct-key-${Date.now()}-${counter++}`;

const okOverview = (r: OverviewResult): AccountOverview => {
  if (r.status !== "ok") throw new Error(`expected ok, got ${r.status}`);
  return r.overview;
};

/** A database that can only read: any write method makes the test fail. Proves the data layer is read-only. */
function readOnly(tx: Tx): AccountDb {
  const guard = <T extends object>(delegate: T): T =>
    new Proxy(delegate, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && !/^find/.test(prop)) throw new Error(`the Account data layer called ${prop}, which is not a read`);
        return Reflect.get(target, prop, receiver);
      },
    });
  return { user: guard(tx.user), organisationMember: guard(tx.organisationMember), organisationProduct: guard(tx.organisationProduct), organisationTeamMember: guard(tx.organisationTeamMember) } as unknown as AccountDb;
}

describe.skipIf(credentials === null)("Account data layer against the real database", () => {
  const creds = credentials as Credentials;
  let pool: Pool;
  let prisma: PrismaClient;

  const scenario = async (fn: (tx: Tx) => Promise<void>) => {
    const err = await prisma.$transaction(async (tx) => { await fn(tx); throw new Rollback(); }, { timeout: 20_000 }).catch((e: unknown) => e);
    if (!(err instanceof Rollback)) throw err;
  };
  const business = async (tx: Tx, userId: string, name: string, product = "caterly") => {
    const r = await createOrganisation(tx, ctx, { userId, idempotencyKey: key(), name, productKey: product });
    if (!r.ok) throw new Error(`setup refused: ${r.code}`);
    return r.organisationId;
  };
  /** A second business, seeded directly (a service transaction may change only one organisation). */
  const seedBusiness = async (tx: Tx, userId: string, name: string, product = "caterly") => {
    const orgId = `biz_${randomBytes(16).toString("hex")}`;
    await tx.organisation.create({ data: { id: orgId, name } });
    await tx.organisationProduct.create({ data: { organisationId: orgId, productKey: product } });
    const m = await tx.organisationMember.create({ data: { organisationId: orgId, userId, centralRole: "admin", status: "active" }, select: { id: true } });
    const slot = await tx.membershipProductSlot.create({ data: { userId, productKey: product, organisationId: orgId, memberId: m.id }, select: { slotId: true } });
    await writeAudit(tx, { action: "slot.allocated", outcome: "done", initiator: ctx.initiator, executor: ctx.executor, organisationId: orgId, subject: { type: "slot", id: slot.slotId } });
    return orgId;
  };

  beforeAll(async () => {
    const target = await openGuarded(creds, { applicationName: "platform-account-data-guard" });
    await target.close();
    pool = new Pool({ connectionString: creds.url(), max: 5, application_name: "platform-account-data" });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    expect(await prisma.auditLog.count()).toBe(0);
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    try {
      expect(await prisma.auditLog.count(), "no scenario may leave an audit row").toBe(0);
      expect(await prisma.organisation.count()).toBe(0);
    } finally {
      await prisma.$disconnect();
      await pool.end();
    }
  });

  it("no session: unauthenticated, and the database is never touched", async () => {
    const untouchable = new Proxy({}, { get: () => { throw new Error("the database was touched"); } }) as unknown as AccountDb;
    expect(await loadAccountOverview(untouchable, null)).toEqual({ status: "unauthenticated" });
    expect(await loadAccountOverview(untouchable, { userId: "", authenticatedAt: new Date() })).toEqual({ status: "unauthenticated" });
  });

  it("a session for an unknown or disabled person is no session", () =>
    scenario(async (tx) => {
      expect(await loadAccountOverview(readOnly(tx), testSession("00000000-0000-4000-8000-000000000000"))).toEqual({ status: "unauthenticated" });
      const disabled = await createTestUser(tx, { status: "disabled" });
      expect(await loadAccountOverview(readOnly(tx), testSession(disabled))).toEqual({ status: "unauthenticated" });
    }));

  it("a signed-in person with no business gets the empty state, with their own email and verification", () =>
    scenario(async (tx) => {
      const id = await createTestUser(tx, { verified: false });
      const o = okOverview(await loadAccountOverview(readOnly(tx), testSession(id)));
      expect(o.business).toEqual({ state: "none" });
      expect(o.user).toMatchObject({ id, emailVerified: false });
      expect(o.user.email).toMatch(/@fixture\.invalid$/);
    }));

  it("the Admin sees their business, role and product link states", () =>
    scenario(async (tx) => {
      const id = await createTestUser(tx);
      const org = await business(tx, id, "Spice Route Caterers");
      const o = okOverview(await loadAccountOverview(readOnly(tx), testSession(id)));
      expect(o.user.emailVerified).toBe(true);
      expect(o.business).toEqual({ state: "ok", business: { id: org, name: "Spice Route Caterers", status: "active", role: "Admin" }, products: { caterly: "linked", rivo: "none" }, team: [] });
    }));

  it("a suspended business and a suspended link are reported as such; unknown product keys are not shown", () =>
    scenario(async (tx) => {
      const id = await createTestUser(tx);
      const org = await business(tx, id, "Paused Co");
      await linkProduct(tx, ctx, { organisationId: org, productKey: "mystery" });
      await setStatus(tx, ctx, { organisationId: org, status: "suspended" });
      await tx.organisationProduct.update({ where: { organisationId_productKey: { organisationId: org, productKey: "caterly" } }, data: { status: "suspended" } });
      const b = okOverview(await loadAccountOverview(readOnly(tx), testSession(id))).business;
      expect(b).toMatchObject({ state: "ok", business: { status: "suspended" }, products: { caterly: "suspended", rivo: "none" } });
      expect(JSON.stringify(b)).not.toContain("mystery");
    }));

  it("isolation: each person sees only their own business, and nothing of the other leaks into the response", () =>
    scenario(async (tx) => {
      const [a, b] = [await createTestUser(tx), await createTestUser(tx)];
      const orgA = await business(tx, a, "Alpha Kitchen");
      const orgB = await seedBusiness(tx, b, "Bravo Kitchen");
      const seenByA = JSON.stringify(await loadAccountOverview(readOnly(tx), testSession(a)));
      const seenByB = JSON.stringify(await loadAccountOverview(readOnly(tx), testSession(b)));
      expect(seenByA).toContain(orgA);
      expect(seenByA).not.toContain(orgB);
      expect(seenByA).not.toContain("Bravo");
      expect(seenByB).toContain(orgB);
      expect(seenByB).not.toContain(orgA);
      expect(seenByB).not.toContain("Alpha");
    }));

  it("a person who is not a member of a business never sees it, even when it is the only business that exists", () =>
    scenario(async (tx) => {
      const owner = await createTestUser(tx);
      await business(tx, owner, "Only Business");
      const outsider = await createTestUser(tx);
      const o = okOverview(await loadAccountOverview(readOnly(tx), testSession(outsider)));
      expect(o.business).toEqual({ state: "none" });
      expect(JSON.stringify(o)).not.toContain("Only Business");
    }));

  it("a former Admin (disabled after a replacement) is forbidden, with no business details; the new Admin sees it", () =>
    scenario(async (tx) => {
      const [oldAdmin, newAdmin] = [await createTestUser(tx), await createTestUser(tx)];
      const org = await business(tx, oldAdmin, "Handed Over Co");
      const member = await tx.organisationMember.findFirstOrThrow({ where: { organisationId: org } });
      await replaceAdmin(tx, ctx, { organisationId: org, expectedPreviousMemberId: member.id, newUserId: newAdmin });
      const former = okOverview(await loadAccountOverview(readOnly(tx), testSession(oldAdmin)));
      expect(former.business).toEqual({ state: "forbidden", reason: "member_disabled" });
      expect(JSON.stringify(former)).not.toContain("Handed Over Co");
      expect(okOverview(await loadAccountOverview(readOnly(tx), testSession(newAdmin))).business).toMatchObject({ state: "ok", business: { name: "Handed Over Co" } });
    }));

  it("a removed membership is forbidden with its own reason", () =>
    scenario(async (tx) => {
      const [oldAdmin, newAdmin] = [await createTestUser(tx), await createTestUser(tx)];
      const org = await business(tx, oldAdmin, "Removed Co");
      const member = await tx.organisationMember.findFirstOrThrow({ where: { organisationId: org } });
      await replaceAdmin(tx, ctx, { organisationId: org, expectedPreviousMemberId: member.id, newUserId: newAdmin });
      await tx.organisationMember.update({ where: { id: member.id }, data: { status: "removed" } });
      expect(okOverview(await loadAccountOverview(readOnly(tx), testSession(oldAdmin))).business).toEqual({ state: "forbidden", reason: "member_removed" });
    }));

  it("when a person has a retired membership and an active one, the active business is shown", () =>
    scenario(async (tx) => {
      const [retired, current] = [await createTestUser(tx), await createTestUser(tx)];
      const first = await business(tx, retired, "Old Place");
      const m = await tx.organisationMember.findFirstOrThrow({ where: { organisationId: first } });
      await replaceAdmin(tx, ctx, { organisationId: first, expectedPreviousMemberId: m.id, newUserId: current });
      const newPlace = await seedBusiness(tx, retired, "New Place", "rivo");
      const b = okOverview(await loadAccountOverview(readOnly(tx), testSession(retired))).business;
      expect(b).toMatchObject({ state: "ok", business: { id: newPlace, name: "New Place" } });
    }));

  it("the data layer only reads (the read-only proxy would throw on any write)", () =>
    scenario(async (tx) => {
      const id = await createTestUser(tx);
      await business(tx, id, "Read Only Co");
      expect(okOverview(await loadAccountOverview(readOnly(tx), testSession(id))).business.state).toBe("ok");
    }));

  it("a database failure is reported as a generic error with nothing from the failure in it", async () => {
    const broken = { user: { findUnique: async () => { throw new Error("password=hunter2 host=secret-db"); } }, organisationMember: {}, organisationProduct: {} } as unknown as AccountDb;
    const result = await loadAccountOverview(broken, testSession("11111111-1111-4111-8111-111111111111"));
    expect(result).toEqual({ status: "error" });
    expect(JSON.stringify(result)).not.toMatch(/hunter2|secret-db/);
  });

  it("toResponse: 401 unauthenticated, 500 error, 200 otherwise, never cached", async () => {
    const unauth = toResponse({ status: "unauthenticated" });
    expect([unauth.status, unauth.headers.get("cache-control"), await unauth.json()]).toEqual([401, "no-store", { status: "unauthenticated" }]);
    const err = toResponse({ status: "error" });
    expect([err.status, await err.json()]).toEqual([500, { status: "error" }]);
    const ok = toResponse({ status: "ok", overview: { user: { id: "u", email: "e", emailVerified: true }, business: { state: "none" } } });
    expect([ok.status, ok.headers.get("cache-control")]).toEqual([200, "no-store"]);
  });
});
