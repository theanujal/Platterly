import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, parseSnapshot, signedHeaders, verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { createPlan, PlanError, setPlanActive, updatePlan, type PlanInput } from "@/modules/plans/plans";
import { assignPlan, startTrial, SubscriptionError, sendTrialNotices, sweepExpired } from "@/modules/subscriptions/subscriptions";
import { receiveEvent } from "@/modules/directory/events";
import { GET as pullGET } from "@/app/api/products/[productKey]/snapshots/[businessId]/route";
import { GET as cronGET } from "@/app/api/cron/route";
import { currentSnapshot, issueSnapshot, refreshDueSnapshots, REFRESH_AFTER_HOURS, SNAPSHOT_VALID_DAYS } from "../issue";

const KEY = "snaptest";
const DAY = 86_400_000;
const manifest = {
  contract: 1, productKey: KEY, name: "Snap Test", version: "1", baseUrl: "https://x.example",
  entitlements: [{ key: "maxCustomers", type: "limit", label: "Customers" }, { key: "multiLocation", type: "flag", label: "Locations" }],
  trial: { days: 7, entitlements: {} },
};

let server: Server;
let baseUrl = "";
let outboundSecret = "";
let inboundSecret = "";
let commands: { id: string | undefined; body: Record<string, unknown> }[] = [];

const businessId = () => `biz_${Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32)}`;

const planInput = (over: Partial<PlanInput> = {}): PlanInput => ({ productKey: KEY, code: "pro", name: "Pro", isTrial: false, priceMonthly: 999, priceAnnual: 9999, gstPercent: 18, highlights: ["One", "Two"], entitlements: { maxCustomers: 100, multiLocation: true }, ...over });

async function clean() {
  await prisma.messageLog.deleteMany({ where: { productKey: KEY } });
  await prisma.business.deleteMany({ where: { name: { startsWith: "SnapTest" } } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}

async function makeBusiness(name = "SnapTest Kitchen") {
  const id = businessId();
  await prisma.business.create({ data: { id, name, ownerEmail: "o@example.test", ownerName: "O", products: { create: { productKey: KEY } } } });
  return id;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      commands.push({ id: req.headers["x-platterly-event-id"] as string | undefined, body: JSON.parse(body) });
      const reply = JSON.stringify({ ok: true, applied: true });
      res.writeHead(200, signedHeaders(inboundSecret, newId("command"), reply));
      res.end(reply);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await clean();
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(async () => {
  await clean();
  commands = [];
  const { secrets } = await registerProduct({ key: KEY, name: "Snap Test", baseUrl, actorUserId: null });
  outboundSecret = secrets.outbound;
  inboundSecret = secrets.inbound;
  await prisma.product.update({ where: { key: KEY }, data: { manifest } });
});
afterEach(clean);

describe("plans", () => {
  it("creates a plan with entitlements checked against the product's manifest", async () => {
    const plan = await createPlan(planInput(), null);
    expect(plan).toMatchObject({ code: "pro", name: "Pro", highlights: ["One", "Two"], entitlements: { maxCustomers: 100, multiLocation: true } });
    expect(Number(plan.gstPercent)).toBe(18);
  });

  it("refuses bad input: unknown entitlement, wrong type, bad code, trial without a length, duplicate code, no manifest", async () => {
    await expect(createPlan(planInput({ entitlements: { surprise: 1 } }), null)).rejects.toThrow(/unknown entitlement/);
    await expect(createPlan(planInput({ entitlements: { maxCustomers: -1 } }), null)).rejects.toThrow(/whole number/);
    await expect(createPlan(planInput({ code: "Bad Code" }), null)).rejects.toThrow(/plan code/);
    await expect(createPlan(planInput({ isTrial: true, trialDurationDays: null }), null)).rejects.toThrow(/trial length/);
    await expect(createPlan(planInput({ gstPercent: 120 }), null)).rejects.toThrow(/GST/);
    await expect(createPlan(planInput({ priceMonthly: -5 }), null)).rejects.toThrow(/monthly price/);
    await createPlan(planInput(), null);
    await expect(createPlan(planInput(), null)).rejects.toThrow(/already has a plan/);
    await prisma.product.update({ where: { key: KEY }, data: { manifest: null as never } }).catch(() => undefined);
    await prisma.$executeRaw`update product set manifest = null where key = ${KEY}`;
    await expect(createPlan(planInput({ code: "other" }), null)).rejects.toThrow(PlanError);
  });

  it("saving a plan sends a fresh snapshot to every business on it, with the new limit", async () => {
    const plan = await createPlan(planInput(), null);
    const a = await makeBusiness();
    const b = await makeBusiness();
    await assignPlan({ businessId: a, productKey: KEY, planId: plan.id, actorUserId: null });
    await assignPlan({ businessId: b, productKey: KEY, planId: plan.id, actorUserId: null });
    commands = [];
    const result = await updatePlan(plan.id, planInput({ entitlements: { maxCustomers: 7, multiLocation: false } }), null);
    expect(result.reissued).toBe(2);
    expect(commands).toHaveLength(2);
    for (const c of commands) {
      const snap = (c.body.payload as { snapshot: { entitlements: unknown; version: number } }).snapshot;
      expect(snap.entitlements).toEqual({ maxCustomers: 7, multiLocation: false });
      expect(snap.version).toBe(2);
    }
  });

  it("a retired plan cannot be assigned", async () => {
    const plan = await createPlan(planInput(), null);
    await setPlanActive(plan.id, false, null);
    await expect(assignPlan({ businessId: await makeBusiness(), productKey: KEY, planId: plan.id, actorUserId: null })).rejects.toThrow(/retired/);
  });
});

describe("subscriptions", () => {
  it("assigning a plan ends the old subscription, keeps history, and leaves exactly one current", async () => {
    const trial = await createPlan(planInput({ code: "trial", name: "Trial", isTrial: true, trialDurationDays: 7, priceMonthly: null, priceAnnual: null, entitlements: { multiLocation: false } }), null);
    const pro = await createPlan(planInput(), null);
    const biz = await makeBusiness();
    const first = await assignPlan({ businessId: biz, productKey: KEY, planId: trial.id, actorUserId: null });
    expect(first.status).toBe("TRIALING");
    expect(first.trialEndsAt!.getTime() - first.startDate.getTime()).toBe(7 * DAY);
    const second = await assignPlan({ businessId: biz, productKey: KEY, planId: pro.id, actorUserId: null });
    expect(second).toMatchObject({ status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: null });
    const rows = await prisma.subscription.findMany({ where: { businessId: biz }, orderBy: { startDate: "asc" } });
    expect(rows.map((r) => r.status)).toEqual(["CANCELLED", "ACTIVE"]);
    expect(rows.filter((r) => r.endDate === null)).toHaveLength(1);
  });

  it("the database refuses two current subscriptions for one business and product", async () => {
    const pro = await createPlan(planInput(), null);
    const biz = await makeBusiness();
    await assignPlan({ businessId: biz, productKey: KEY, planId: pro.id, actorUserId: null });
    await expect(prisma.subscription.create({ data: { id: newId("subscription"), businessId: biz, productKey: KEY, planId: pro.id, status: "ACTIVE" } })).rejects.toThrow();
  });

  it("refuses a business that is not on the product and a plan from another product", async () => {
    const pro = await createPlan(planInput(), null);
    const stranger = businessId();
    await prisma.business.create({ data: { id: stranger, name: "SnapTest Stranger" } });
    await expect(assignPlan({ businessId: stranger, productKey: KEY, planId: pro.id, actorUserId: null })).rejects.toThrow(SubscriptionError);
    await expect(assignPlan({ businessId: await makeBusiness(), productKey: KEY, planId: "nope", actorUserId: null })).rejects.toThrow(/does not belong/);
  });

  it("a brand-new business that signs up starts a trial and gets its first snapshot; a backfilled one does not", async () => {
    await createPlan(planInput({ code: "trial", name: "Trial", isTrial: true, trialDurationDays: 7, priceMonthly: null, priceAnnual: null, entitlements: { multiLocation: false } }), null);
    const signup = async (name: string, backfill: boolean) => {
      const body = { eventId: newId("event"), productKey: KEY, businessId: businessId(), occurredAt: new Date().toISOString(), type: "business.signed_up", data: { businessName: name, ownerName: "O", ownerEmail: "o@example.test", ...(backfill ? { backfill: true } : {}) } };
      const raw = JSON.stringify(body);
      const reply = await receiveEvent(raw, new Headers(signedHeaders(inboundSecret, body.eventId, raw)));
      expect(reply.status).toBe(200);
      return body.businessId;
    };
    const fresh = await signup("SnapTest Fresh", false);
    const sub = await prisma.subscription.findFirstOrThrow({ where: { businessId: fresh, endDate: null }, include: { plan: true } });
    expect(sub).toMatchObject({ status: "TRIALING", plan: { code: "trial" } });
    expect(commands.some((c) => c.body.businessId === fresh && c.body.type === "snapshot.push")).toBe(true);

    const old = await signup("SnapTest Old", true);
    expect(await prisma.subscription.count({ where: { businessId: old } })).toBe(0);
  });

  it("startTrial does nothing without a trial plan, and never starts a second subscription", async () => {
    const biz = await makeBusiness();
    expect(await startTrial(biz, KEY)).toBeNull();
    await createPlan(planInput({ code: "trial", name: "Trial", isTrial: true, trialDurationDays: 3, priceMonthly: null, priceAnnual: null, entitlements: {} }), null);
    expect(await startTrial(biz, KEY)).not.toBeNull();
    expect(await startTrial(biz, KEY)).toBeNull();
  });

  it("the sweep marks an ended trial and an ended paid period LOCKED and sends a new snapshot, and leaves hand-assigned plans alone", async () => {
    const trial = await createPlan(planInput({ code: "trial", name: "Trial", isTrial: true, trialDurationDays: 7, priceMonthly: null, priceAnnual: null, entitlements: {} }), null);
    const pro = await createPlan(planInput(), null);
    const [a, b, c] = [await makeBusiness(), await makeBusiness(), await makeBusiness()];
    const subA = await assignPlan({ businessId: a, productKey: KEY, planId: trial.id, actorUserId: null });
    const subB = await assignPlan({ businessId: b, productKey: KEY, planId: pro.id, actorUserId: null });
    await assignPlan({ businessId: c, productKey: KEY, planId: pro.id, actorUserId: null });
    await prisma.subscription.update({ where: { id: subA.id }, data: { trialEndsAt: new Date(Date.now() - DAY) } });
    await prisma.subscription.update({ where: { id: subB.id }, data: { currentPeriodEnd: new Date(Date.now() - DAY) } });
    commands = [];
    expect(await sweepExpired(new Date(), KEY)).toBe(2);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: subA.id } })).status).toBe("LOCKED");
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: subB.id } })).status).toBe("LOCKED");
    const sent = commands.map((x) => (x.body.payload as { snapshot: { status: string } }).snapshot.status);
    expect(sent.sort()).toEqual(["LOCKED", "LOCKED"]);
    expect(await sweepExpired(new Date(), KEY)).toBe(0);
    // Only the trial gets an "ended" email, once; a paid period that lapsed does not. (Hand-assigned paid plans send "plan changed".)
    expect(await prisma.messageLog.findMany({ where: { productKey: KEY, template: "trial_ended" }, select: { businessId: true } })).toEqual([{ businessId: a }]);
    expect(await prisma.messageLog.count({ where: { productKey: KEY, template: "plan_changed" } })).toBe(2);
  });

  it("trial notices go out at 3 days and at 1 day, once each, and never for an ended, paid or far-off trial", async () => {
    const trial = await createPlan(planInput({ code: "trial", name: "Trial", isTrial: true, trialDurationDays: 30, priceMonthly: null, priceAnnual: null, entitlements: {} }), null);
    const [a, b, c] = [await makeBusiness(), await makeBusiness(), await makeBusiness()];
    const subA = await assignPlan({ businessId: a, productKey: KEY, planId: trial.id, actorUserId: null });
    const subB = await assignPlan({ businessId: b, productKey: KEY, planId: trial.id, actorUserId: null });
    await assignPlan({ businessId: c, productKey: KEY, planId: trial.id, actorUserId: null });
    const now = new Date();
    await prisma.subscription.update({ where: { id: subA.id }, data: { trialEndsAt: new Date(now.getTime() + 2.5 * DAY) } });
    await prisma.subscription.update({ where: { id: subB.id }, data: { trialEndsAt: new Date(now.getTime() + 0.5 * DAY) } });
    expect(await prisma.messageLog.count({ where: { productKey: KEY, template: "plan_changed" } })).toBe(0); // a sign-up trial is not a plan change
    expect(await sendTrialNotices(now, KEY)).toBe(2);
    expect(await sendTrialNotices(now, KEY)).toBe(2);
    const rows = await prisma.messageLog.findMany({ where: { productKey: KEY, template: "trial_ending" }, select: { businessId: true, variables: true } });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.businessId === a)!.variables).toEqual({ daysLeft: 3 });
    expect(rows.find((r) => r.businessId === b)!.variables).toEqual({ daysLeft: 1 });
    // A day later the first trial is in its last day: it gets the "1 day" notice too, but still not a second "3 days".
    await sendTrialNotices(new Date(now.getTime() + 1.6 * DAY), KEY);
    expect(await prisma.messageLog.count({ where: { productKey: KEY, template: "trial_ending", businessId: a } })).toBe(2);
  });
});

describe("snapshots", () => {
  async function subscribed() {
    const plan = await createPlan(planInput(), null);
    const biz = await makeBusiness();
    await assignPlan({ businessId: biz, productKey: KEY, planId: plan.id, actorUserId: null });
    return { plan, biz };
  }

  it("issues a valid, signed snapshot command with a rising version", async () => {
    const { biz } = await subscribed();
    const first = commands.find((c) => c.body.businessId === biz)!;
    expect(first.id).toBe(first.body.commandId);
    const snap = (first.body.payload as { snapshot: unknown }).snapshot;
    const parsed = parseSnapshot(snap, manifest.entitlements as never);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toMatchObject({ businessId: biz, productKey: KEY, version: 1, status: "ACTIVE", plan: { code: "pro" }, entitlements: { maxCustomers: 100, multiLocation: true } });
      expect(Date.parse(parsed.value.validUntil) - Date.parse(parsed.value.issuedAt)).toBe(SNAPSHOT_VALID_DAYS * DAY);
    }
    await issueSnapshot(biz, KEY);
    expect((commands.at(-1)!.body.payload as { snapshot: { version: number } }).snapshot.version).toBe(2);
    expect((await prisma.businessProduct.findUniqueOrThrow({ where: { businessId_productKey: { businessId: biz, productKey: KEY } } })).snapshotVersion).toBe(2);
  });

  it("issues nothing, and uses up no version, for a business with no subscription", async () => {
    const biz = await makeBusiness();
    expect(await issueSnapshot(biz, KEY)).toBeNull();
    expect((await prisma.businessProduct.findUniqueOrThrow({ where: { businessId_productKey: { businessId: biz, productKey: KEY } } })).snapshotVersion).toBe(0);
  });

  it("the daily refresh re-issues only snapshots older than a day", async () => {
    const { biz } = await subscribed();
    expect(await refreshDueSnapshots(new Date(), 200, KEY)).toBe(0);
    await prisma.businessProduct.update({ where: { businessId_productKey: { businessId: biz, productKey: KEY } }, data: { snapshotIssuedAt: new Date(Date.now() - (REFRESH_AFTER_HOURS + 1) * 3_600_000) } });
    commands = [];
    expect(await refreshDueSnapshots(new Date(), 200, KEY)).toBe(1);
    expect(commands).toHaveLength(1);
  });

  it("a product can pull its business's snapshot; the reply is signed by ops and carries the already-issued version", async () => {
    const { biz } = await subscribed();
    const pull = (secret: string, key = KEY, id = biz) =>
      pullGET(new Request(`http://127.0.0.1:3200/api/products/${key}/snapshots/${id}`, { headers: signedHeaders(secret, newId("command"), "") }), { params: Promise.resolve({ productKey: key, businessId: id }) });
    const res = await pull(inboundSecret);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(verifyRequest([outboundSecret], res.headers, text).ok).toBe(true);
    expect(JSON.parse(text)).toMatchObject({ businessId: biz, version: 1, status: "ACTIVE" });
    expect((await prisma.businessProduct.findUniqueOrThrow({ where: { businessId_productKey: { businessId: biz, productKey: KEY } } })).snapshotVersion).toBe(1);

    expect((await pull("wrong-secret")).status).toBe(401);
    expect((await pull(inboundSecret, "snaptest-nope")).status).toBe(401);
    expect((await pull(inboundSecret, KEY, businessId())).status).toBe(404);
  });

  it("a pull for a business never issued one yet issues the first", async () => {
    const plan = await createPlan(planInput(), null);
    const biz = await makeBusiness();
    // A subscription created outside assignPlan (for example by the import) has no snapshot yet.
    await prisma.subscription.create({ data: { id: newId("subscription"), businessId: biz, productKey: KEY, planId: plan.id, status: "ACTIVE" } });
    expect((await prisma.businessProduct.findUniqueOrThrow({ where: { businessId_productKey: { businessId: biz, productKey: KEY } } })).snapshotVersion).toBe(0);
    const snap = await currentSnapshot(biz, KEY);
    expect(snap?.version).toBe(1);
  });

  it("a product cannot pull another product's business", async () => {
    const other = await registerProduct({ key: "snaptest2", name: "Other", baseUrl: baseUrl, actorUserId: null });
    try {
      const { biz } = await subscribed();
      const res = await pullGET(new Request(`http://127.0.0.1:3200/api/products/snaptest2/snapshots/${biz}`, { headers: signedHeaders(other.secrets.inbound, newId("command"), "") }), { params: Promise.resolve({ productKey: "snaptest2", businessId: biz }) });
      expect(res.status).toBe(404);
    } finally {
      await prisma.product.deleteMany({ where: { key: "snaptest2" } });
    }
  });

  it("the cron sweeps, refreshes and sends in one run", async () => {
    process.env.CRON_SECRET = "cron-6b-secret";
    const { biz } = await subscribed();
    await prisma.subscription.updateMany({ where: { businessId: biz, endDate: null }, data: { status: "TRIALING", trialEndsAt: new Date(Date.now() - DAY) } });
    const res = await cronGET(new Request(`http://127.0.0.1:3200/api/cron?product=${KEY}`, { headers: { authorization: "Bearer cron-6b-secret" } }));
    expect(await res.json()).toMatchObject({ locked: 1 });
    delete process.env.CRON_SECRET;
  });
});
