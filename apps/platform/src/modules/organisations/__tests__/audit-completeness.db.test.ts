import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { loadCredentials, openGuarded, type Credentials } from "../../../lib/migration-roundtrip/__tests__/db-target";
import { createTestUser } from "../../users/__tests__/fixtures";
import { adoptOrganisation, createOrganisation, linkProduct, replaceAdmin, setStatus, unlinkProduct, type Context, type Result } from "..";

// F3.3.1 audit completeness check. Every exported F3.2.2 service must be listed here, and each listed service must, for every outcome:
//   - state changed        -> exactly ONE `done` audit row of its own action (slot events are separate actions and are counted apart);
//   - nothing changed      -> no `done` row of its own action (an idempotent no-op writes nothing);
//   - refused              -> exactly ONE `refused` row of its own action, and the state is unchanged.
// "State" is a fingerprint of every table a service can write (organisations, members, products, slots, tombstones, outbox). A new service that
// is not in this table fails the enumeration test, so it cannot ship without an audit scenario. The audit table itself is append-only
// (proved in organisation-schema.db.test.ts), so a row can neither be skipped later nor removed.
const credentials = loadCredentials(process.env.PLATFORM_TEST_CREDENTIALS_DIR);
class Rollback extends Error {}
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
const ctx: Context = { initiator: { kind: "user", ref: "u" }, executor: { kind: "system", ref: "t" } };

/** The state-changing services, with the action each must audit. */
const SERVICES = {
  createOrganisation: "organisation.created",
  adoptOrganisation: "organisation.adopted",
  replaceAdmin: "admin.replaced",
  linkProduct: "product.linked",
  unlinkProduct: "product.unlinked",
  setStatus: "organisation.status_changed",
} as const;
/** Exported but not state-changing: no audit row is expected. */
const READ_ONLY = ["lockOrganisation", "getLinkState"] as const;
/** Exported non-function values and types. */
const NOT_SERVICES = ["PRODUCT_KEY", "assertProductKey", "InvalidInputError", "OneOrganisationPerTransactionError", "OrganisationNotFoundError", "SlotRaceError"];

describe("F3.3.1 audit completeness: enumeration (no database)", () => {
  it("every function exported by the organisations module is a listed service or a listed read-only helper", () => {
    const index = readFileSync(path.resolve(__dirname, "../index.ts"), "utf8");
    const exported = [...index.matchAll(/export\s*\{([^}]*)\}\s*from/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()).filter(Boolean));
    const known = new Set<string>([...Object.keys(SERVICES), ...READ_ONLY, ...NOT_SERVICES]);
    expect(exported.filter((e) => !known.has(e))).toEqual([]);
    for (const name of Object.keys(SERVICES)) expect(exported, `${name} must stay exported`).toContain(name);
  });
});

describe.skipIf(credentials === null)("F3.3.1 audit completeness: every service outcome (real database)", () => {
  const creds = credentials as Credentials;
  let pool: Pool;
  let prisma: PrismaClient;
  let keyCounter = 0;
  const key = () => `audit-key-${Date.now()}-${keyCounter++}`;

  const fingerprint = async (tx: Tx) =>
    JSON.stringify({
      organisations: await tx.organisation.findMany({ orderBy: { id: "asc" } }),
      members: await tx.organisationMember.findMany({ orderBy: { id: "asc" } }),
      products: await tx.organisationProduct.findMany({ orderBy: [{ organisationId: "asc" }, { productKey: "asc" }] }),
      slots: await tx.membershipProductSlot.findMany({ orderBy: { slotId: "asc" } }),
      unlinks: await tx.organisationProductUnlink.findMany({ orderBy: { id: "asc" } }),
      requests: await tx.organisationCreationRequest.findMany({ orderBy: { id: "asc" } }),
      outbox: await tx.outboxEvent.count(),
    }, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

  /** Runs `act` and reports whether state changed and how many audit rows of `action` (by outcome) it wrote. */
  const observe = async (tx: Tx, action: string, act: () => Promise<Result<unknown>>) => {
    const before = await fingerprint(tx);
    const auditBefore = await tx.auditLog.findMany({ where: { action }, select: { id: true } });
    const result = await act();
    const after = await fingerprint(tx);
    const rows = (await tx.auditLog.findMany({ where: { action, id: { notIn: auditBefore.map((r) => r.id) } }, select: { outcome: true } })).map((r) => r.outcome);
    return { result, changed: before !== after, done: rows.filter((o) => o === "done").length, refused: rows.filter((o) => o === "refused").length };
  };
  const scenario = async (fn: (tx: Tx) => Promise<void>) => {
    const err = await prisma.$transaction(async (tx) => { await fn(tx); throw new Rollback(); }, { timeout: 20_000 }).catch((e: unknown) => e);
    if (!(err instanceof Rollback)) throw err;
  };
  const expectChanged = (o: Awaited<ReturnType<typeof observe>>) => expect({ ok: o.result.ok, changed: o.changed, done: o.done, refused: o.refused }).toEqual({ ok: true, changed: true, done: 1, refused: 0 });
  const expectNoOp = (o: Awaited<ReturnType<typeof observe>>) => expect({ ok: o.result.ok, changed: o.changed, done: o.done, refused: o.refused }).toEqual({ ok: true, changed: false, done: 0, refused: 0 });
  const expectRefused = (o: Awaited<ReturnType<typeof observe>>) => expect({ ok: o.result.ok, changed: o.changed, done: o.done, refused: o.refused }).toEqual({ ok: false, changed: false, done: 0, refused: 1 });
  const orgFor = async (tx: Tx, productKey = "alpha") => {
    const user = await createTestUser(tx);
    const r = await createOrganisation(tx, ctx, { userId: user, idempotencyKey: key(), name: "Audit Co", productKey });
    if (!r.ok) throw new Error("setup refused");
    return { user, id: r.organisationId };
  };

  beforeAll(async () => {
    const target = await openGuarded(creds, { applicationName: "platform-f331-guard" });
    await target.close();
    pool = new Pool({ connectionString: creds.url(), max: 5, application_name: "platform-f331" });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    expect(await prisma.auditLog.count(), "audit_logs must be empty before the test").toBe(0);
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    try {
      expect(await prisma.auditLog.count(), "no scenario may leave an audit row").toBe(0);
    } finally {
      await prisma.$disconnect();
      await pool.end();
    }
  });

  it("createOrganisation: created -> one row; replay -> none; refused -> one refused row", () =>
    scenario(async (tx) => {
      const user = await createTestUser(tx);
      const k = key();
      const input = { userId: user, idempotencyKey: k, name: "Same", productKey: "alpha" };
      expectChanged(await observe(tx, SERVICES.createOrganisation, () => createOrganisation(tx, ctx, input)));
      expectNoOp(await observe(tx, SERVICES.createOrganisation, () => createOrganisation(tx, ctx, input)));
      expectRefused(await observe(tx, SERVICES.createOrganisation, () => createOrganisation(tx, ctx, { ...input, name: "Different" })));
    }));

  it("adoptOrganisation: adopted -> one row", () =>
    scenario(async (tx) => {
      expectChanged(await observe(tx, SERVICES.adoptOrganisation, () => adoptOrganisation(tx, ctx, { name: "Imported" })));
    }));

  it("replaceAdmin: replaced -> one row; refused -> one refused row", () =>
    scenario(async (tx) => {
      const { id } = await orgFor(tx);
      const member = await tx.organisationMember.findFirstOrThrow({ where: { organisationId: id } });
      const next = await createTestUser(tx);
      expectChanged(await observe(tx, SERVICES.replaceAdmin, () => replaceAdmin(tx, ctx, { organisationId: id, expectedPreviousMemberId: member.id, newUserId: next })));
      const third = await createTestUser(tx);
      expectRefused(await observe(tx, SERVICES.replaceAdmin, () => replaceAdmin(tx, ctx, { organisationId: id, expectedPreviousMemberId: member.id, newUserId: third })));
    }));

  it("linkProduct: linked -> one row (its slots are separate slot.allocated rows); already linked -> none", () =>
    scenario(async (tx) => {
      const { id } = await orgFor(tx);
      expectChanged(await observe(tx, SERVICES.linkProduct, () => linkProduct(tx, ctx, { organisationId: id, productKey: "beta" })));
      expectNoOp(await observe(tx, SERVICES.linkProduct, () => linkProduct(tx, ctx, { organisationId: id, productKey: "beta" })));
    }));

  it("unlinkProduct: unlinked -> one row; not linked -> none; last link -> one refused row", () =>
    scenario(async (tx) => {
      const { id } = await orgFor(tx);
      await linkProduct(tx, ctx, { organisationId: id, productKey: "beta" });
      expectChanged(await observe(tx, SERVICES.unlinkProduct, () => unlinkProduct(tx, ctx, { organisationId: id, productKey: "beta" })));
      expectNoOp(await observe(tx, SERVICES.unlinkProduct, () => unlinkProduct(tx, ctx, { organisationId: id, productKey: "beta" })));
      expectRefused(await observe(tx, SERVICES.unlinkProduct, () => unlinkProduct(tx, ctx, { organisationId: id, productKey: "alpha" })));
    }));

  it("setStatus: changed -> one row; same status -> none", () =>
    scenario(async (tx) => {
      const { id } = await orgFor(tx);
      expectChanged(await observe(tx, SERVICES.setStatus, () => setStatus(tx, ctx, { organisationId: id, status: "suspended" })));
      expectNoOp(await observe(tx, SERVICES.setStatus, () => setStatus(tx, ctx, { organisationId: id, status: "suspended" })));
    }));

  it("slot rows only ever appear with their own slot event (the database also requires it at commit)", () =>
    scenario(async (tx) => {
      const { id } = await orgFor(tx);
      await linkProduct(tx, ctx, { organisationId: id, productKey: "beta" });
      await unlinkProduct(tx, ctx, { organisationId: id, productKey: "beta" });
      const slotEvents = await tx.auditLog.findMany({ where: { organisationId: id, subjectType: "slot" } });
      const slotIds = new Set(slotEvents.map((e) => e.subjectId));
      const actions = slotEvents.map((e) => e.action).sort();
      expect(actions).toEqual(["slot.allocated", "slot.allocated", "slot.released"]);
      expect(slotIds.size).toBe(2);
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    }));
});
