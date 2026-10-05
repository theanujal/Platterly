import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, parseManifest, signedHeaders, verifyRequest, type EntitlementSnapshot } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { GET as manifestGET } from "@/app/api/ops/manifest/route";
import { POST as commandsPOST } from "@/app/api/ops/commands/route";
import { GET as businessesGET } from "@/app/api/ops/businesses/route";
import { GET as businessGET } from "@/app/api/ops/businesses/[businessId]/route";
import { GET as healthGET } from "@/app/api/ops/health/route";
import { updateTenant } from "@/modules/tenants/tenant";
import { attemptDelivery, enqueueEvent, MAX_ATTEMPTS, RETRY_DELAYS_SECONDS, runDueOutbox } from "../outbox";
import { getActiveNotice, savePlatformNotice } from "@/modules/subscriptions/platform-notice";
import { getChannelSettings } from "@/modules/notifications/channel-settings";
import { emitBusinessSignedUp, emitWelcomeRequested, runOpsLinkJobs } from "../events";

const COMMAND_SECRET = "opssec_command_test";
const OLD_COMMAND_SECRET = "opssec_command_old";
const EVENT_SECRET = "opssec_event_test";
const startedAt = new Date();

const saved: Record<string, string | undefined> = {};
const orgIds: string[] = [];
const userIds: string[] = [];

function enableLink(baseUrl = "http://127.0.0.1:9") {
  process.env.OPS_BASE_URL = baseUrl;
  process.env.OPS_EVENT_SECRET = EVENT_SECRET;
  process.env.OPS_COMMAND_SECRETS = `${COMMAND_SECRET},${OLD_COMMAND_SECRET}`;
  process.env.OPS_PRODUCT_KEY = "catering";
}

beforeAll(() => {
  for (const k of ["OPS_BASE_URL", "OPS_EVENT_SECRET", "OPS_COMMAND_SECRETS", "OPS_PRODUCT_KEY"]) saved[k] = process.env[k];
});
beforeEach(() => enableLink());
afterEach(async () => {
  // Remove only what this test created, including every outbox/command row written since it started.
  await prisma.opsOutbox.deleteMany({ where: { createdAt: { gte: startedAt } } });
  await prisma.opsCommand.deleteMany({ where: { receivedAt: { gte: startedAt } } });
  // The scheduled job also pulls snapshots (and remembers the ones ops has none for); none of that may outlive the test.
  await prisma.opsNotice.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.opsPull.deleteMany({ where: { lastPulledAt: { gte: startedAt } } });
  await prisma.opsSnapshot.deleteMany({ where: { receivedAt: { gte: startedAt } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.notification.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function makeOrg(over: { name?: string; ownerEmail?: string | null; status?: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" } = {}) {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: over.name ?? "OpsLink Test Kitchen", slug: `opslink-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date(), status: over.status ?? "ACTIVE", ownerFirstName: "Asha", ownerLastName: "K" },
  });
  orgIds.push(org.id);
  if (over.ownerEmail !== null) {
    const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Asha K", email: over.ownerEmail ?? `owner-${crypto.randomUUID()}@example.test`, emailVerified: true } });
    userIds.push(user.id);
    await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: user.id, role: "owner", createdAt: new Date() } });
  }
  return org;
}

/** A request signed the way ops signs it. */
function opsRequest(path: string, init: { method?: string; body?: unknown; secret?: string; id?: string } = {}) {
  const body = init.body === undefined ? "" : JSON.stringify(init.body);
  const headers = signedHeaders(init.secret ?? COMMAND_SECRET, init.id ?? newId("command"), body);
  return new Request(`http://127.0.0.1:3000${path}`, { method: init.method ?? "GET", headers, body: body || undefined });
}

function snapshotFor(businessId: string, version: number, status: EntitlementSnapshot["status"] = "ACTIVE"): EntitlementSnapshot {
  return {
    businessId, productKey: "catering", subscriptionId: newId("subscription"), version, plan: { code: "pro", name: "Pro" }, status, interval: "MONTHLY", currentPeriodEnd: null, trialEndsAt: null,
    entitlements: { maxCustomers: 100, multiLocation: true }, issuedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  };
}

const command = (businessId: string, type: string, payload: unknown = {}) => ({ commandId: newId("command"), businessId, type, payload });

describe("the ops routes", () => {
  it("answer 404 while the link is not configured, as if the route did not exist", async () => {
    delete process.env.OPS_BASE_URL;
    for (const res of [await manifestGET(opsRequest("/api/ops/manifest")), await healthGET(opsRequest("/api/ops/health")), await businessesGET(opsRequest("/api/ops/businesses")), await commandsPOST(opsRequest("/api/ops/commands", { method: "POST", body: {} }))]) {
      expect(res.status).toBe(404);
    }
  });

  it("refuse an unsigned, wrongly signed or stale request with 401 and no detail", async () => {
    const unsigned = new Request("http://127.0.0.1:3000/api/ops/manifest");
    expect((await manifestGET(unsigned)).status).toBe(401);
    expect((await manifestGET(opsRequest("/api/ops/manifest", { secret: "not-the-secret" }))).status).toBe(401);
    const stale = new Request("http://127.0.0.1:3000/api/ops/manifest", { headers: signedHeaders(COMMAND_SECRET, newId("command"), "", Math.floor(Date.now() / 1000) - 3600) });
    const res = await manifestGET(stale);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("accept the previous command secret during a rotation", async () => {
    expect((await healthGET(opsRequest("/api/ops/health", { secret: OLD_COMMAND_SECRET }))).status).toBe(200);
  });

  it("serve a manifest that ops accepts, signed with the event secret", async () => {
    const res = await manifestGET(opsRequest("/api/ops/manifest"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(verifyRequest([EVENT_SECRET], res.headers, text).ok).toBe(true);
    const parsed = parseManifest(JSON.parse(text));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.productKey).toBe("catering");
      expect(parsed.value.entitlements.map((e) => e.key)).toContain("maxCustomers");
      expect(parsed.value.entitlements.find((e) => e.key === "multiLocation")?.type).toBe("flag");
      expect(parsed.value.trial.days).toBe(7);
    }
  });

  it("lists businesses in pages and returns one business's summary and counts", async () => {
    const org = await makeOrg();
    const page = await (await businessesGET(opsRequest("/api/ops/businesses?take=2"))).json();
    expect(page.items.length).toBeLessThanOrEqual(2);
    expect(page.items[0]).toHaveProperty("businessId");
    const one = await (await businessGET(opsRequest(`/api/ops/businesses/${org.businessId}`), { params: Promise.resolve({ businessId: org.businessId }) })).json();
    expect(one).toMatchObject({ businessId: org.businessId, name: "OpsLink Test Kitchen", status: "ACTIVE", counts: { customers: 0, orders: 0, events: 0, users: 1 }, snapshot: null });
    const missing = await businessGET(opsRequest("/api/ops/businesses/biz_nope"), { params: Promise.resolve({ businessId: "biz_nope" }) });
    expect(missing.status).toBe(404);
  });
});

async function send(body: unknown) {
  const res = await commandsPOST(opsRequest("/api/ops/commands", { method: "POST", body }));
  return { status: res.status, body: await res.json() };
}

describe("commands", () => {
  it("stores a snapshot, ignores an older or repeated version, and refuses an unknown business", async () => {
    const org = await makeOrg();
    expect((await send(command(org.businessId, "snapshot.push", { snapshot: snapshotFor(org.businessId, 2) }))).body).toMatchObject({ ok: true, applied: true, version: 2 });
    expect((await send(command(org.businessId, "snapshot.push", { snapshot: snapshotFor(org.businessId, 1) }))).body).toMatchObject({ applied: false, version: 2 });
    expect((await send(command(org.businessId, "snapshot.push", { snapshot: snapshotFor(org.businessId, 3, "LOCKED") }))).body).toMatchObject({ applied: true, version: 3 });
    const stored = await prisma.opsSnapshot.findUniqueOrThrow({ where: { businessId: org.businessId } });
    expect(stored.version).toBe(3);
    expect((stored.data as { status: string }).status).toBe("LOCKED");

    const ghost = `biz_${"0".repeat(32)}`;
    expect((await send(command(ghost, "snapshot.push", { snapshot: snapshotFor(ghost, 1) }))).status).toBe(404);
  });

  it("rejects a snapshot with an entitlement catering does not declare, and a snapshot for another business", async () => {
    const org = await makeOrg();
    const other = await makeOrg();
    const odd = { ...snapshotFor(org.businessId, 1), entitlements: { notAThing: 1 } };
    expect((await send(command(org.businessId, "snapshot.push", { snapshot: odd }))).status).toBe(400);
    expect((await send(command(org.businessId, "snapshot.push", { snapshot: snapshotFor(other.businessId, 1) }))).status).toBe(400);
  });

  it("answers a repeated command id with the stored answer and applies it once", async () => {
    const org = await makeOrg();
    const cmd = command(org.businessId, "business.suspend", { reason: "non-payment" });
    expect((await send(cmd)).body).toMatchObject({ ok: true, status: "SUSPENDED" });
    await prisma.organization.update({ where: { id: org.id }, data: { status: "ACTIVE" } });
    // Same command id again: the stored answer comes back and nothing runs, so the status stays as someone set it since.
    expect((await send(cmd)).body).toMatchObject({ ok: true, status: "SUSPENDED" });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).status).toBe("ACTIVE");
    expect(await prisma.opsCommand.count({ where: { commandId: cmd.commandId } })).toBe(1);
  });

  it("suspends and reactivates, but never lifts a deactivation", async () => {
    const org = await makeOrg();
    await send(command(org.businessId, "business.suspend", { reason: "r" }));
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).status).toBe("SUSPENDED");
    await send(command(org.businessId, "business.reactivate"));
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).status).toBe("ACTIVE");

    const dead = await makeOrg({ status: "DEACTIVATED" });
    expect((await send(command(dead.businessId, "business.reactivate"))).status).toBe(409);
    expect((await send(command(dead.businessId, "business.suspend", { reason: "r" }))).status).toBe(409);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: dead.id } })).status).toBe("DEACTIVATED");
  });

  it("400s on garbage", async () => {
    expect((await send({ nonsense: true })).status).toBe(400);
    expect((await commandsPOST(opsRequest("/api/ops/commands", { method: "POST", body: "not json" as unknown as object }))).status).toBe(400);
  });
});

const isProviderConnected = async (organizationId: string, channel: "email" | "whatsapp") => (await getChannelSettings(organizationId, channel)).providerConnected;

describe("business lifecycle commands", () => {
  const provisionBody = (businessId: string) => command(businessId, "business.provision", { businessName: "Ops Made Kitchen", ownerEmail: "boss@opsmade.example.test", ownerName: "Ravi Kumar Singh", snapshot: snapshotFor(businessId, 1) });

  it("provision creates the kitchen under ops's business id with its first snapshot, and a repeat answers the same kitchen", async () => {
    const businessId = newId("business");
    const first = await send(provisionBody(businessId));
    expect(first.status).toBe(200);
    const org = await prisma.organization.findUniqueOrThrow({ where: { businessId } });
    orgIds.push(org.id);
    expect(first.body).toMatchObject({ ok: true, organizationId: org.id, existing: false });
    expect(org).toMatchObject({ name: "Ops Made Kitchen", ownerFirstName: "Ravi", ownerLastName: "Kumar Singh", contactEmail: "boss@opsmade.example.test", status: "ACTIVE" });
    expect(org.slug).toMatch(/^biz-/);
    expect(await prisma.opsSnapshot.findUnique({ where: { businessId } })).toMatchObject({ organizationId: org.id, version: 1 });
    const again = await send(provisionBody(businessId));
    expect(again.body).toMatchObject({ organizationId: org.id, existing: true });
    expect(await prisma.organization.count({ where: { businessId } })).toBe(1);
  });

  it("provision refuses a snapshot for another business", async () => {
    const businessId = newId("business");
    const body = command(businessId, "business.provision", { businessName: "X", ownerEmail: "a@b.test", ownerName: "A", snapshot: snapshotFor(newId("business"), 1) });
    expect((await send(body)).status).toBe(400);
    expect(await prisma.organization.count({ where: { businessId } })).toBe(0);
  });

  it("update changes the name and owner, the contact, and the slug, and tells ops about a rename", async () => {
    const org = await makeOrg({ name: "Before Name" });
    const reply = await send(command(org.businessId, "business.update", { businessName: "After Name", ownerFirstName: "Meera", contactPhone: "9876543210", slug: "after-name-1" }));
    expect(reply).toMatchObject({ status: 200, body: { ok: true } });
    expect(await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({ name: "After Name", ownerFirstName: "Meera", ownerLastName: "K", contactPhone: "9876543210", slug: "after-name-1" });
    const queued = await prisma.opsOutbox.findMany({ where: { businessId: org.businessId, type: "business.updated" } });
    expect(queued.map((e) => (e.payload as { data: unknown }).data)).toContainEqual({ businessName: "After Name", ownerName: "Meera K" });
  });

  it("update on only the slug leaves the profile alone; a taken slug is 409 and a badly formed one 400", async () => {
    const a = await makeOrg({ name: "Slug A" });
    const b = await makeOrg({ name: "Slug B" });
    expect((await send(command(a.businessId, "business.update", { slug: "slug-only-1" }))).status).toBe(200);
    expect(await prisma.organization.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ name: "Slug A", slug: "slug-only-1" });
    expect((await send(command(b.businessId, "business.update", { slug: "slug-only-1" }))).status).toBe(409);
    expect((await send(command(b.businessId, "business.update", { slug: "bad slug!" }))).status).toBe(400);
    expect((await send(command("biz_" + "7".repeat(32), "business.update", { businessName: "x" }))).status).toBe(404);
  });

  it("provider.set connects and disconnects a channel, and disconnecting switches it off for the kitchen", async () => {
    const org = await makeOrg();
    expect((await send(command(org.businessId, "provider.set", { channel: "email", connected: true }))).status).toBe(200);
    expect(await isProviderConnected(org.id, "email")).toBe(true);
    expect((await send(command(org.businessId, "provider.set", { channel: "email", connected: false }))).status).toBe(200);
    expect(await isProviderConnected(org.id, "email")).toBe(false);
    expect((await prisma.auditLog.findMany({ where: { organizationId: org.id, action: { startsWith: "notifications.email_provider" } } })).map((a) => a.action).sort()).toEqual(["notifications.email_provider_connected", "notifications.email_provider_disconnected"]);
  });

  it("delete needs the typed business name, then suspends (restorable) and removes no data; restore reactivates", async () => {
    const org = await makeOrg({ name: "Delete Me Kitchen" });
    expect((await send(command(org.businessId, "business.delete", { confirmation: "wrong name", retentionDays: 30 }))).body).toMatchObject({ error: "confirmation_mismatch" });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).status).toBe("ACTIVE");
    expect((await send(command(org.businessId, "business.delete", { confirmation: "Delete Me Kitchen", retentionDays: 30 }))).body).toMatchObject({ ok: true, status: "SUSPENDED", dataRemoved: false });
    expect(await prisma.organization.findUnique({ where: { id: org.id } })).toMatchObject({ status: "SUSPENDED" });
    expect((await send(command(org.businessId, "business.restore"))).body).toMatchObject({ ok: true, status: "ACTIVE" });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).status).toBe("ACTIVE");
    expect((await prisma.auditLog.findMany({ where: { organizationId: org.id, action: { startsWith: "tenant.delete" } } })).map((a) => a.action).sort()).toEqual(["tenant.delete_requested", "tenant.delete_restored"]);
  });

  it("delete and restore leave a deactivated business alone (409)", async () => {
    const org = await makeOrg({ name: "Gone Kitchen", status: "DEACTIVATED" });
    expect((await send(command(org.businessId, "business.delete", { confirmation: "Gone Kitchen" }))).status).toBe(409);
    expect((await send(command(org.businessId, "business.restore"))).status).toBe(409);
  });
});

describe("notice.set", () => {
  const notice = { enabled: true, title: "Diwali offer", message: "20% off yearly plans.", buttonLabel: "See plans", buttonUrl: "/subscribe" };

  it("stores the notice for that business only, and a later one replaces it", async () => {
    const org = await makeOrg();
    const other = await makeOrg();
    expect((await send(command(org.businessId, "notice.set", notice))).body).toEqual({ ok: true });
    expect(await prisma.opsNotice.findUnique({ where: { businessId: org.businessId } })).toMatchObject({ organizationId: org.id, enabled: true, title: "Diwali offer", buttonUrl: "/subscribe" });
    expect(await prisma.opsNotice.findUnique({ where: { businessId: other.businessId } })).toBeNull();
    await send(command(org.businessId, "notice.set", { enabled: false, title: null, message: null, buttonLabel: null, buttonUrl: null }));
    expect(await prisma.opsNotice.findUnique({ where: { businessId: org.businessId } })).toMatchObject({ enabled: false, title: null });
  });

  it("applies a repeated command once and refuses text over this product's limits with 400", async () => {
    const org = await makeOrg();
    const cmd = command(org.businessId, "notice.set", notice);
    expect((await send(cmd)).status).toBe(200);
    await prisma.opsNotice.update({ where: { businessId: org.businessId }, data: { title: "edited" } });
    expect((await send(cmd)).status).toBe(200);
    expect((await prisma.opsNotice.findUniqueOrThrow({ where: { businessId: org.businessId } })).title).toBe("edited");
    const long = await send(command(org.businessId, "notice.set", { ...notice, message: "x".repeat(300) }));
    expect(long.status).toBe(400);
    expect(await send(command(org.businessId, "notice.set", { ...notice, buttonUrl: "javascript:alert(1)" }))).toMatchObject({ status: 400 });
  });

  it("is refused from the old Super Admin form once ops owns it, and works there as before while the flag is off", async () => {
    const form = { enabled: false, title: "", message: "", buttonLabel: "", buttonUrl: "" };
    await expect(savePlatformNotice(form)).resolves.toBeTruthy();
    process.env.OPS_BILLING = "1";
    try {
      await expect(savePlatformNotice(form)).rejects.toThrow(/managed in Platterly Ops/);
    } finally {
      delete process.env.OPS_BILLING;
    }
  });

  it("answers 404 for a business this product does not have", async () => {
    expect((await send(command("biz_" + "0".repeat(32), "notice.set", notice))).status).toBe(404);
  });

  it("is what a kitchen sees only with OPS_BILLING on; off, the single Super Admin row decides", async () => {
    const org = await makeOrg();
    await send(command(org.businessId, "notice.set", notice));
    process.env.OPS_BILLING = "1";
    try {
      expect(await getActiveNotice(org.id)).toEqual({ title: "Diwali offer", message: "20% off yearly plans.", buttonLabel: "See plans", buttonUrl: "/subscribe" });
      expect(await getActiveNotice((await makeOrg()).id)).toBeNull();
    } finally {
      delete process.env.OPS_BILLING;
    }
    const global = await getActiveNotice(org.id);
    expect(global?.title).not.toBe("Diwali offer");
  });
});

describe("events to ops", () => {
  let server: Server;
  let received: { headers: Record<string, string | string[] | undefined>; body: string }[];
  let respondWith = 200;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        // Only events are recorded; a snapshot pull (GET) is answered "no subscription" so it leaves nothing behind.
        if (req.method !== "POST") return void ((res.statusCode = 404), res.end("{}"));
        received.push({ headers: req.headers, body });
        res.statusCode = respondWith;
        res.end("{}");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    received = [];
    respondWith = 200;
    enableLink(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  });

  it("sends a queued event signed with the event secret, exactly as ops verifies it", async () => {
    const org = await makeOrg();
    const eventId = await enqueueEvent({ type: "usage.reported", businessId: org.businessId, data: { periodStart: "2026-10-05T00:00:00.000Z", counts: { customers: 1 } } });
    expect(eventId).toBeTruthy();
    expect(await attemptDelivery(eventId!)).toBe("sent");
    expect(received).toHaveLength(1);
    const verified = verifyRequest([EVENT_SECRET], new Headers(received[0].headers as Record<string, string>), received[0].body);
    expect(verified).toMatchObject({ ok: true, id: eventId });
    expect(JSON.parse(received[0].body)).toMatchObject({ eventId, productKey: "catering", businessId: org.businessId, type: "usage.reported" });
    expect((await prisma.opsOutbox.findUniqueOrThrow({ where: { eventId: eventId! } })).status).toBe("SENT");
    expect(await attemptDelivery(eventId!)).toBe("skipped");
  });

  it("retries on a 5xx on the 1m, 5m, 30m, 2h, 12h schedule, then gives up; a 4xx fails at once", async () => {
    const org = await makeOrg();
    respondWith = 503;
    const id = (await enqueueEvent({ type: "owner.changed", businessId: org.businessId, data: { ownerEmail: "a@example.test" } }))!;
    let now = new Date();
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      expect(await attemptDelivery(id, now)).toBe("retry");
      const row = await prisma.opsOutbox.findUniqueOrThrow({ where: { eventId: id } });
      expect(row.status).toBe("PENDING");
      const wait = row.nextAttemptAt!.getTime() - Date.now();
      expect(Math.abs(wait - RETRY_DELAYS_SECONDS[attempt - 1] * 1000)).toBeLessThan(5000);
      now = new Date(row.nextAttemptAt!.getTime() + 1000);
    }
    expect(await attemptDelivery(id, now)).toBe("failed");
    expect(await prisma.opsOutbox.findUniqueOrThrow({ where: { eventId: id } })).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS });

    respondWith = 400;
    const bad = (await enqueueEvent({ type: "owner.changed", businessId: org.businessId, data: { ownerEmail: "b@example.test" } }))!;
    expect(await attemptDelivery(bad)).toBe("failed");
  });

  it("survives ops being down: the event stays queued for the scheduled retry", async () => {
    const org = await makeOrg();
    enableLink("http://127.0.0.1:9");
    const id = (await enqueueEvent({ type: "owner.changed", businessId: org.businessId, data: { ownerEmail: "c@example.test" } }))!;
    expect(await attemptDelivery(id)).toBe("retry");
    expect((await prisma.opsOutbox.findUniqueOrThrow({ where: { eventId: id } })).lastError).toMatch(/Could not reach ops/);
  });

  it("queues a dedupe key once, refuses an invalid event, and does nothing while the link is off", async () => {
    const org = await makeOrg();
    const input = { type: "owner.changed" as const, businessId: org.businessId, data: { ownerEmail: "d@example.test" }, dedupeKey: `test:${org.businessId}` };
    expect(await enqueueEvent(input)).toBeTruthy();
    expect(await enqueueEvent(input)).toBeNull();
    expect(await enqueueEvent({ type: "owner.changed", businessId: "nope", data: { ownerEmail: "d@example.test" } })).toBeNull();
    delete process.env.OPS_EVENT_SECRET;
    expect(await enqueueEvent({ ...input, dedupeKey: undefined })).toBeNull();
  });

  it("tells ops about a business once (sign-up hook and catch-up share a key), with the owner's real email", async () => {
    const org = await makeOrg({ name: "Spice Route", ownerEmail: "asha@spice.example.test" });
    await emitBusinessSignedUp(org.id);
    await emitBusinessSignedUp(org.id);
    const mine = received.filter((r) => JSON.parse(r.body).businessId === org.businessId);
    expect(mine).toHaveLength(1);
    expect(JSON.parse(mine[0].body)).toMatchObject({ type: "business.signed_up", data: { businessName: "Spice Route", ownerName: "Asha K", ownerEmail: "asha@spice.example.test" } });
    expect(JSON.parse(mine[0].body).data.backfill).toBeUndefined();
  });

  it("asks ops to send the welcome email once, only when ops owns billing", async () => {
    const org = await makeOrg({ name: "Welcome Kitchen" });
    const mine = () => received.map((r) => JSON.parse(r.body)).filter((e) => e.businessId === org.businessId && e.type === "message.requested");
    await emitWelcomeRequested(org.id);
    expect(mine()).toHaveLength(0);
    process.env.OPS_BILLING = "1";
    try {
      await emitWelcomeRequested(org.id);
      await emitWelcomeRequested(org.id);
    } finally {
      delete process.env.OPS_BILLING;
    }
    expect(mine()).toHaveLength(1);
    expect(mine()[0].data).toEqual({ template: "welcome_owner", variables: {} });
    const noEmail = await makeOrg({ ownerEmail: null });
    process.env.OPS_BILLING = "1";
    try {
      await emitWelcomeRequested(noEmail.id);
    } finally {
      delete process.env.OPS_BILLING;
    }
    expect(received.map((r) => JSON.parse(r.body)).filter((e) => e.businessId === noEmail.businessId)).toHaveLength(0);
  });

  it("sends nothing for a business with no known email", async () => {
    const org = await makeOrg({ ownerEmail: null });
    await emitBusinessSignedUp(org.id);
    expect(received.filter((r) => JSON.parse(r.body).businessId === org.businessId)).toHaveLength(0);
  });

  it("sends business.updated with only what changed when a business is renamed", async () => {
    const org = await makeOrg({ name: "Old Name" });
    const before = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    await updateTenant(org.id, { name: "New Name" }, (await prisma.user.findFirstOrThrow({ where: { id: { in: userIds } } })).id);
    const mine = received.map((r) => JSON.parse(r.body)).filter((e) => e.businessId === org.businessId && e.type === "business.updated");
    expect(mine).toHaveLength(1);
    expect(mine[0].data).toEqual({ businessName: "New Name" });
    expect(before.name).toBe("Old Name");
    received = [];
    await updateTenant(org.id, { name: "New Name" }, userIds[0]);
    expect(received.filter((r) => JSON.parse(r.body).type === "business.updated")).toHaveLength(0);
  });

  it("the scheduled job catches up unknown businesses and reports usage once a day", async () => {
    const org = await makeOrg({ ownerEmail: `catchup-${crypto.randomUUID()}@example.test` });
    const first = await runOpsLinkJobs(new Date(), 1000);
    expect(first.signedUp).toBeGreaterThanOrEqual(1);
    expect(first.usage).toBeGreaterThanOrEqual(1);
    // Each run sends at most 50 events (a first catch-up of many businesses takes a few runs), so drain the rest.
    while ((await runDueOutbox(new Date(), 50)) > 0);
    const events = received.map((r) => JSON.parse(r.body)).filter((e) => e.businessId === org.businessId);
    expect(events.map((e) => e.type).sort()).toEqual(["business.signed_up", "usage.reported"]);
    expect(events.find((e) => e.type === "business.signed_up").data.backfill).toBe(true);
    expect(events.find((e) => e.type === "usage.reported").data.counts).toEqual({ customers: 0, orders: 0, events: 0, users: 1 });

    received = [];
    const second = await runOpsLinkJobs(new Date(), 1000);
    expect(second.signedUp).toBe(0);
    expect(second.usage).toBe(0);
    expect(received.filter((r) => JSON.parse(r.body).businessId === org.businessId)).toHaveLength(0);
  });

  it("a business with no owner email is neither announced nor reported on", async () => {
    const org = await makeOrg({ ownerEmail: null });
    await runOpsLinkJobs(new Date(), 1000);
    while ((await runDueOutbox(new Date(), 50)) > 0);
    expect(received.filter((r) => JSON.parse(r.body).businessId === org.businessId)).toHaveLength(0);
    expect(await prisma.opsOutbox.count({ where: { businessId: org.businessId } })).toBe(0);
  });

  it("the scheduled job does nothing while the link is off", async () => {
    delete process.env.OPS_BASE_URL;
    expect(await runOpsLinkJobs()).toEqual({ sent: 0, signedUp: 0, usage: 0, pulled: 0 });
  });
});
