import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
// The import is a plain .mjs script module (it also runs from the command line).
import { LIMIT_COLUMNS, applyImport, buildImport, readSource, reconcile, runImport, stableId, syncSequence } from "../../../../scripts/lib/catering-import.mjs";
import { prisma } from "@/lib/db";

/**
 * A stand-in for catering: a throwaway schema in the ops test database with the same tables and column names the import
 * reads. The import's source connection looks tables up through this schema (search_path), so it reads the stand-in and
 * can never touch real catering data. The product, plans and subscriptions it writes use their own product key.
 */
const KEY = "impt";
const SCHEMA = "src_import_test";
// The real ops database already holds the imported billing profile (id "platform"), so the tests use a profile row of their own.
const PROFILE = "platform-impt";
const url = process.env.DATABASE_URL!;

let source: pg.Client; // what the import reads: it becomes read-only once the import has run, like in real use
let admin: pg.Client; // sets up and changes the stand-in catering data
let target: pg.Client;
let seqBefore: { last_value: string; is_called: boolean };

const manifest = { contract: 1, productKey: KEY, name: "Import Test", version: "1", baseUrl: "https://x.example", entitlements: [...LIMIT_COLUMNS.map((k: string) => ({ key: k, type: "limit", label: k })), { key: "multiLocation", type: "flag", label: "Multi" }], trial: { days: 7, entitlements: {} } };
const biz = (n: number) => `biz_${String(n).padStart(32, "0")}`;

async function createSource() {
  const source = admin;
  await source.query(`drop schema if exists ${SCHEMA} cascade; create schema ${SCHEMA}`);
  await source.query(`
    create table organization (id text primary key, "businessId" text not null, name text not null);
    create table subscription_plan (id text primary key, code text, name text, description text, "isTrial" boolean default false, "trialDurationDays" int, "priceMonthly" numeric, "priceAnnual" numeric, currency text default 'INR',
      "maxUsers" int, "maxEvents" int, "maxOrders" int, "maxKitchens" int, "maxStores" int, "maxCustomers" int, "maxMenuLinks" int, "maxStorageMb" int, "maxReports" int, "maxWhatsappMessages" int,
      "isActive" boolean default true, "createdAt" timestamp default now(), "updatedAt" timestamp default now(), "gstPercent" numeric default 18, highlights text[] default '{}', "multiLocation" boolean default false);
    create table subscription (id text primary key, "organizationId" text, "subscriptionPlanId" text, status text, "startDate" timestamp, "trialEndsAt" timestamp, "endDate" timestamp, "createdAt" timestamp default now(), "updatedAt" timestamp default now(),
      "billingInterval" text, "currentPeriodEnd" timestamp, "pendingInterval" text, "pendingPlanId" text);
    create table subscription_payment (id text primary key, "organizationId" text, "subscriptionPlanId" text, interval text, amount numeric, "gstPercent" numeric, "gstAmount" numeric, total numeric, status text, "razorpayOrderId" text, "razorpayPaymentId" text,
      "invoiceNumber" text, "periodStart" timestamp, "periodEnd" timestamp, "paidAt" timestamp, "createdAt" timestamp default now(), "invoiceSnapshot" jsonb);
    create table platform_billing_profile (id text primary key, "legalName" text, "addressLine1" text, "addressLine2" text, city text, state text, "stateCode" text, "postalCode" text, country text, gstin text, pan text, "sacCode" text default '998314',
      "invoicePrefix" text default 'FP', email text, phone text, website text, "invoiceNote" text, "updatedAt" timestamp default now());
    create sequence subscription_invoice_seq;
  `);
  await source.query(`insert into organization values ('o1', '${biz(1)}', 'Kitchen One'), ('o2', '${biz(2)}', 'Kitchen Two'), ('o3', '${biz(3)}', 'Kitchen Three (unknown to ops)')`);
  await source.query(`insert into subscription_plan (id, code, name, "isTrial", "trialDurationDays", "priceMonthly", "priceAnnual", "maxCustomers", "multiLocation", highlights, "createdAt", "updatedAt") values
    ('p-trial', 'trial', 'Trial', true, 7, null, null, null, false, '{}', '2026-09-01', '2026-09-01'),
    ('p-pro', 'pro', 'Pro', false, null, 999.50, 9999, 100, true, '{"Orders","Reports"}', '2026-09-02', '2026-09-03')`);
  await source.query(`insert into subscription values
    ('s1a', 'o1', 'p-trial', 'CANCELLED', '2026-09-10', '2026-09-17', '2026-09-12', '2026-09-10', '2026-09-12', null, null, null, null),
    ('s1b', 'o1', 'p-pro', 'ACTIVE', '2026-09-12', null, null, '2026-09-12', '2026-09-12', 'MONTHLY', '2026-11-11', 'ANNUAL', 'p-trial'),
    ('s2', 'o2', 'p-trial', 'TRIALING', '2026-10-01', '2026-10-08', null, '2026-10-01', '2026-10-01', null, null, null, null),
    ('s3', 'o3', 'p-pro', 'ACTIVE', '2026-10-01', null, null, '2026-10-01', '2026-10-01', null, null, null, null)`);
  await source.query(`insert into subscription_payment values
    ('pay1', 'o1', 'p-pro', 'MONTHLY', 999.50, 18, 179.91, 1179.41, 'PAID', 'order_1', 'pay_1', 'FPKO-26-09-41', '2026-09-12', '2026-10-12', '2026-09-12 10:00', '2026-09-12', '{"seller":{"legalName":"Platterly"}}'),
    ('pay2', 'o1', 'p-pro', 'ANNUAL', 9999, 18, 1799.82, 11798.82, 'PAID', 'order_2', 'pay_2', 'FPKO-26-10-42', '2026-10-12', '2027-10-12', '2026-10-12 10:00', '2026-10-12', '{"seller":{"legalName":"Platterly"}}'),
    ('pay3', 'o1', 'p-pro', 'MONTHLY', 999.50, 18, 179.91, 1179.41, 'PENDING', 'order_3', null, null, null, null, null, '2026-10-13', null),
    ('pay4', 'o1', 'p-pro', 'MONTHLY', 999.50, 18, 179.91, 1179.41, 'FAILED', 'order_4', null, null, null, null, null, '2026-10-13', null),
    ('pay5', 'o3', 'p-pro', 'MONTHLY', 999.50, 18, 179.91, 1179.41, 'PAID', 'order_5', 'pay_5', 'FPKT-26-10-43', '2026-10-01', '2026-10-31', '2026-10-01 10:00', '2026-10-01', '{}')`);
  await source.query(`insert into platform_billing_profile (id, "legalName", gstin, "stateCode", "invoicePrefix") values ('${PROFILE}', 'Platterly Pvt Ltd', '29ABCDE1234F1Z5', '29', 'FP')`);
  await source.query(`select setval('subscription_invoice_seq', 43, true)`);
}

async function clean() {
  // Payments and subscriptions are accounting records and are never deleted with a business (Restrict), so remove them first.
  await target.query(`delete from subscription_payment where "productKey" = $1`, [KEY]);
  await target.query(`delete from subscription where "productKey" = $1`, [KEY]);
  await target.query(`delete from plan where "productKey" = $1`, [KEY]);
  await prisma.business.deleteMany({ where: { id: { in: [biz(1), biz(2), biz(3)] } } });
  await prisma.product.deleteMany({ where: { key: KEY } });
  await target.query(`delete from platform_billing_profile where id = $1`, [PROFILE]);
}

async function seedTarget() {
  await prisma.product.create({ data: { key: KEY, name: "Import Test", baseUrl: "http://127.0.0.1:1", outboundSecret: "x", inboundSecret: "x", manifest } });
  for (const n of [1, 2]) await prisma.business.create({ data: { id: biz(n), name: `ImportTest ${n}`, products: { create: { productKey: KEY } } } });
}

beforeAll(async () => {
  source = new pg.Client({ connectionString: url, options: `-c search_path=${SCHEMA}` });
  admin = new pg.Client({ connectionString: url, options: `-c search_path=${SCHEMA}` });
  target = new pg.Client({ connectionString: url });
  await Promise.all([admin.connect(), target.connect()]);
  seqBefore = (await target.query("select last_value, is_called from subscription_invoice_seq")).rows[0];
});
afterAll(async () => {
  await clean();
  await admin.query(`drop schema if exists ${SCHEMA} cascade`);
  // The ops invoice sequence is shared state: put it back exactly as it was.
  await target.query("select setval('subscription_invoice_seq', $1, $2)", [seqBefore.last_value, seqBefore.is_called]);
  await Promise.all([source.end(), admin.end(), target.end()]);
});
beforeEach(async () => {
  await clean();
  // A fresh read-only-capable connection for every test (a previous run left the old one read-only).
  await source.end().catch(() => undefined);
  source = new pg.Client({ connectionString: url, options: `-c search_path=${SCHEMA}` });
  await source.connect();
  await createSource();
  await seedTarget();
  await target.query("select setval('subscription_invoice_seq', $1, $2)", [seqBefore.last_value, seqBefore.is_called]);
});
afterEach(clean);

const counts = async () => ({
  plans: (await target.query(`select count(*)::int n from plan where "productKey" = $1`, [KEY])).rows[0].n,
  subscriptions: (await target.query(`select count(*)::int n from subscription where "productKey" = $1`, [KEY])).rows[0].n,
  payments: (await target.query(`select count(*)::int n from subscription_payment where "productKey" = $1`, [KEY])).rows[0].n,
});

describe("the catering import", () => {
  it("builds the rows: every plan, only known businesses' subscriptions, only PAID payments, with limits as entitlements", async () => {
    const data = await readSource(source, PROFILE);
    const built = buildImport(data, new Set([biz(1), biz(2)]), new Set(manifest.entitlements.map((e) => e.key)));
    expect(built.errors).toEqual([]);
    expect(built.plans.map((p: { code: string }) => p.code).sort()).toEqual(["pro", "trial"]);
    expect(built.plans.find((p: { code: string }) => p.code === "pro").entitlements).toMatchObject({ maxCustomers: 100, maxUsers: null, multiLocation: true });
    expect(built.subscriptions).toHaveLength(3);
    expect(built.subscriptions.map((s: { status: string }) => s.status).sort()).toEqual(["ACTIVE", "CANCELLED", "TRIALING"]);
    expect(built.payments.map((p: { invoiceNumber: string }) => p.invoiceNumber).sort()).toEqual(["FPKO-26-09-41", "FPKO-26-10-42"]);
    expect(built.skipped).toEqual({ subscriptionsUnknownBusiness: 1, paymentsUnknownBusiness: 1, paymentsNotPaid: 2, businessesUnknown: 1 });
    // The deterministic ids are what make a second run harmless.
    expect(built.subscriptions[0].id).toBe(stableId("sub", "s1a"));
  });

  it("a dry run does everything, reconciles, and keeps nothing", async () => {
    const result = await runImport({ source, target, dryRun: true, productKey: KEY, profileId: PROFILE });
    expect(result).toMatchObject({ ok: true, committed: false, dryRun: true });
    expect(result.applied!.inserted).toEqual({ plans: 2, subscriptions: 3, payments: 2, profile: expect.any(Number) });
    expect(result.reconciliation!.checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
    expect(await counts()).toEqual({ plans: 0, subscriptions: 0, payments: 0 });
    expect((await target.query("select last_value, is_called from subscription_invoice_seq")).rows[0]).toEqual(seqBefore);
  });

  it("applying commits the rows with exact values, keeps history, and raises the invoice sequence to catering's", async () => {
    const result = await runImport({ source, target, dryRun: false, productKey: KEY, profileId: PROFILE });
    expect(result).toMatchObject({ ok: true, committed: true });
    expect(await counts()).toEqual({ plans: 2, subscriptions: 3, payments: 2 });

    const pro = (await target.query(`select * from plan where "productKey" = $1 and code = 'pro'`, [KEY])).rows[0];
    expect(Number(pro.priceMonthly)).toBe(999.5);
    expect(pro.highlights).toEqual(["Orders", "Reports"]);
    expect(pro.entitlements).toMatchObject({ maxCustomers: 100, multiLocation: true, maxOrders: null });

    const current = (await target.query(`select s.*, p.code as plan from subscription s join plan p on p.id = s."planId" where s."businessId" = $1 and s."endDate" is null`, [biz(1)])).rows;
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ status: "ACTIVE", plan: "pro", billingInterval: "MONTHLY" });
    expect(current[0].pendingInterval).toBe("ANNUAL");
    expect(current[0].pendingPlanId).toBeTruthy();
    expect((await target.query(`select count(*)::int n from subscription where "businessId" = $1`, [biz(1)])).rows[0].n).toBe(2);

    const pay = (await target.query(`select * from subscription_payment where "invoiceNumber" = 'FPKO-26-10-42'`)).rows[0];
    expect(Number(pay.total)).toBe(11798.82);
    expect(pay.invoiceSnapshot).toEqual({ seller: { legalName: "Platterly" } });
    expect(pay.importedFrom).toBe("catering:pay2");

    expect(result.sequence!).toMatchObject({ catering: 43, opsAfter: Math.max(43, result.sequence!.opsBefore) });
    const next = (await target.query("select nextval('subscription_invoice_seq') as n")).rows[0].n;
    expect(Number(next)).toBeGreaterThan(43);
  });

  it("running it again changes nothing and never overwrites what staff edited in ops", async () => {
    await runImport({ source, target, dryRun: false, productKey: KEY, profileId: PROFILE });
    await target.query(`update plan set name = 'Pro (edited in ops)', "priceMonthly" = 1500 where "productKey" = $1 and code = 'pro'`, [KEY]);
    const again = await runImport({ source, target, dryRun: false, productKey: KEY, profileId: PROFILE });
    expect(again.applied!.inserted).toMatchObject({ plans: 0, subscriptions: 0, payments: 0 });
    expect(await counts()).toEqual({ plans: 2, subscriptions: 3, payments: 2 });
    expect((await target.query(`select name from plan where "productKey" = $1 and code = 'pro'`, [KEY])).rows[0].name).toBe("Pro (edited in ops)");
  });

  it("leaves a business that already has a subscription in ops alone", async () => {
    await target.query(`insert into plan (id, "productKey", code, name, "isTrial", entitlements, "updatedAt") values ('plan_existing', $1, 'pro', 'Pro (ops)', false, '{}', now())`, [KEY]);
    await target.query(`insert into subscription (id, "businessId", "productKey", "planId", status, "updatedAt") values ('sub_existing', $1, $2, 'plan_existing', 'ACTIVE', now())`, [biz(2), KEY]);
    const result = await runImport({ source, target, dryRun: false, productKey: KEY, profileId: PROFILE });
    expect(result.ok).toBe(true);
    expect(result.applied!.skippedExisting).toEqual({ businessesAlreadyInOps: 1, plansAlreadyInOps: 1, profileAlreadyInOps: false });
    // The plan ops already had is untouched.
    expect((await target.query(`select name from plan where id = 'plan_existing'`)).rows[0].name).toBe("Pro (ops)");
    expect((await target.query(`select id from subscription where "businessId" = $1`, [biz(2)])).rows.map((r: { id: string }) => r.id)).toEqual(["sub_existing"]);
    // Business one still imported, and mapped onto the plan ops already had for that code.
    const rows = (await target.query(`select "planId" from subscription where "businessId" = $1 and "endDate" is null`, [biz(1)])).rows;
    expect(rows[0].planId).toBe("plan_existing");
  });

  it("refuses inconsistent source data and imports nothing", async () => {
    await admin.query(`update subscription_payment set "invoiceNumber" = null where id = 'pay1'`);
    await admin.query(`update subscription_payment set total = 1 where id = 'pay2'`);
    await admin.query(`update subscription set "subscriptionPlanId" = 'p-gone' where id = 's2'`);
    await admin.query(`update subscription_plan set "maxUsers" = 5`);
    const result = await runImport({ source, target, dryRun: false, productKey: KEY, profileId: PROFILE });
    expect(result.ok).toBe(false);
    expect(result.committed).toBe(false);
    expect(result.errors.join("\n")).toMatch(/no invoice number/);
    expect(result.errors.join("\n")).toMatch(/amount \+ GST does not equal total/);
    expect(result.errors.join("\n")).toMatch(/plan p-gone is missing|its plan p-gone is missing/);
    expect(await counts()).toEqual({ plans: 0, subscriptions: 0, payments: 0 });
  });

  it("refuses a plan limit the product's manifest does not declare, and a missing product manifest", async () => {
    await prisma.product.update({ where: { key: KEY }, data: { manifest: { ...manifest, entitlements: manifest.entitlements.filter((e) => e.key !== "maxCustomers") } } });
    const bad = await runImport({ source, target, dryRun: true, productKey: KEY, profileId: PROFILE });
    expect(bad.errors.join("\n")).toMatch(/"maxCustomers" is not an entitlement/);
    await target.query(`update product set manifest = null where key = $1`, [KEY]);
    await expect(runImport({ source, target, dryRun: true, productKey: KEY, profileId: PROFILE })).rejects.toThrow(/read its manifest first/);
  });

  it("the reconciliation catches a row that does not match, and rolls back", async () => {
    const data = await readSource(source, PROFILE);
    const built = buildImport(data, new Set([biz(1), biz(2)]), new Set(manifest.entitlements.map((e) => e.key)));
    await target.query("begin");
    const applied = await applyImport(target, built, KEY);
    expect((await reconcile(target, built, applied, KEY)).ok).toBe(true);
    await target.query(`update subscription_payment set total = total + 1 where "invoiceNumber" = 'FPKO-26-09-41'`);
    await target.query(`update subscription set status = 'LOCKED' where "businessId" = $1 and "endDate" is null`, [biz(1)]);
    const broken = await reconcile(target, built, applied, KEY);
    expect(broken.ok).toBe(false);
    expect(broken.checks.filter((c: { ok: boolean }) => !c.ok).map((c: { name: string }) => c.name).join(" | ")).toMatch(/total received[\s\S]*differ|rows whose dates, status/);
    await target.query("rollback");
  });

  it("only ever reads catering: a write on the source connection is refused by the database", async () => {
    await runImport({ source, target, dryRun: true, productKey: KEY, profileId: PROFILE });
    await expect(source.query(`insert into organization values ('o9', 'biz_x', 'X')`)).rejects.toThrow(/read-only transaction/);
    await expect(source.query(`select nextval('subscription_invoice_seq')`)).rejects.toThrow(/read-only transaction/);
    // The source sequence was only read, never advanced.
    expect(Number((await source.query("select last_value from subscription_invoice_seq")).rows[0].last_value)).toBe(43);
  });

  it("the invoice sequence only ever moves forward", async () => {
    await target.query("select setval('subscription_invoice_seq', 500, true)");
    const result = await syncSequence(target, { last_value: "43", is_called: true });
    expect(result).toEqual({ catering: 43, opsBefore: 500, opsAfter: 500 });
    expect(Number((await target.query("select nextval('subscription_invoice_seq') as n")).rows[0].n)).toBe(501);
    // A sequence that was never used yet counts as "nothing issued".
    expect(await syncSequence(target, { last_value: "1", is_called: false })).toMatchObject({ catering: 0 });
  });

  it("refuses to run with the same connection as source and target", async () => {
    await expect(runImport({ source: target, target, dryRun: true, productKey: KEY })).rejects.toThrow(/same connection/);
  });
});
