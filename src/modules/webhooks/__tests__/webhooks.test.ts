import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/modules/payments/secret-box";
import { createWebhookEndpoint, deleteWebhookEndpoint, listDeliveries, listWebhookEndpoints, retryDelivery, rotateWebhookSecret, updateWebhookEndpoint, MAX_WEBHOOK_ENDPOINTS } from "../endpoints";
import { attemptDelivery, classify, MAX_ATTEMPTS, RETRY_DELAYS_SECONDS, runDueWebhookDeliveries } from "../deliver";
import { enqueue } from "../emit";
import { signPayload, verifySignature, SIGNATURE_TOLERANCE_SECONDS } from "../signing";
import { assertWebhookUrl, isPrivateAddress } from "../url-guard";
import { createCustomer, updateCustomer } from "@/modules/customers/customer";
import { createOrder, updateOrder } from "@/modules/orders/order";
import { recordPayment, confirmPayment, rejectPayment } from "@/modules/payments/payment";
import { createEvent } from "@/modules/events/event";

/**
 * Chunk 25 — outbound webhooks against a real local receiver: signing and replay protection, retries, permanent
 * failures, the SSRF guard, secrets at rest, tenant separation, and that real activity in the app queues the events.
 */
process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS = "true"; // the receiver below is on 127.0.0.1; ignored in production

interface Received {
  headers: Record<string, string | string[] | undefined>;
  body: string;
}
let server: Server;
let baseUrl = "";
let received: Received[] = [];
let respondWith = 200;
let respondHeaders: Record<string, string> = {};

const orgIds: string[] = [];
const userIds: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      res.writeHead(respondWith, respondHeaders);
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(async () => {
  received = [];
  respondWith = 200;
  respondHeaders = {};
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.payment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = userIds.length = 0;
});

async function kitchen(label = "w") {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: `Hooks ${label}`, slug: `hooks-${label}-${crypto.randomUUID().slice(0, 6)}`, status: "ACTIVE", createdAt: new Date() } });
  orgIds.push(org.id);
  const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: label, email: `${label}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(user.id);
  return { orgId: org.id, userId: user.id };
}

const ALL = ["order.created", "order.updated", "order.status_changed", "customer.created", "customer.updated", "event.created", "event.updated", "payment.created", "payment.updated", "payment.failed"];

async function endpoint(k: { orgId: string; userId: string }, events: string[] = ALL, url = baseUrl) {
  return createWebhookEndpoint(k.orgId, { url, events }, k.userId);
}

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, ms = 4000): Promise<T> {
  const end = Date.now() + ms;
  let value = await read();
  while (!done(value) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 40));
    value = await read();
  }
  return value;
}

describe("the address guard", () => {
  it("refuses private, loopback, link-local, metadata and internal addresses, credentials and plain http, in production mode", () => {
    const saved = process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS;
    process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS = "false";
    try {
      for (const bad of ["http://example.com/x", "https://localhost/x", "https://app.localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://172.16.0.1/x", "https://192.168.1.10/x", "https://169.254.169.254/latest/meta-data", "https://[::1]/x", "https://[fd00::1]/x", "https://[::ffff:127.0.0.1]/x", "https://[::ffff:7f00:1]/x", "https://[::127.0.0.1]/x", "https://[64:ff9b::7f00:1]/x", "https://[2002:7f00:1::]/x", "https://[::]/x", "https://[fe80::1]/x", "https://[0:0:0:0:0:0:0:1]/x", "https://printer.local/x", "https://db.internal/x", "https://intranet/x", "https://user:pass@example.com/x", "ftp://example.com/x", "not a url", "https://0.0.0.0/x", "https://100.64.0.1/x"]) {
        expect(() => assertWebhookUrl(bad), bad).toThrow();
      }
      expect(assertWebhookUrl("https://hooks.example.com/platterly?x=1").hostname).toBe("hooks.example.com");
      expect(assertWebhookUrl("https://8.8.8.8/x").hostname).toBe("8.8.8.8");
    } finally {
      process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS = saved;
    }
  });

  it("classifies addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.31.255.255", "192.168.0.1", "169.254.1.1", "::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:a00:1", "224.0.0.1", "fc00::1", "ff02::1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:808:808"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe("signing", () => {
  const secret = "whsec_test";
  const body = '{"id":"evt_1"}';
  const now = 1_800_000_000;

  it("verifies a good signature and refuses a changed body, a wrong secret, a bad header and a replay", () => {
    const sig = signPayload(secret, now, body);
    expect(sig).toMatch(/^v1=[a-f0-9]{64}$/);
    expect(verifySignature(secret, sig, String(now), body, now)).toBe(true);
    expect(verifySignature(secret, sig, String(now), body + " ", now)).toBe(false);
    expect(verifySignature("whsec_other", sig, String(now), body, now)).toBe(false);
    expect(verifySignature(secret, sig.replace("v1=", "v2="), String(now), body, now)).toBe(false);
    expect(verifySignature(secret, null, String(now), body, now)).toBe(false);
    expect(verifySignature(secret, sig, null, body, now)).toBe(false);
    expect(verifySignature(secret, sig, "abc", body, now)).toBe(false);
    // A captured request replayed later is refused by its timestamp, however valid its signature.
    expect(verifySignature(secret, sig, String(now), body, now + SIGNATURE_TOLERANCE_SECONDS + 1)).toBe(false);
    expect(verifySignature(secret, sig, String(now), body, now + SIGNATURE_TOLERANCE_SECONDS)).toBe(true);
  });

  it("the timestamp is part of what is signed, so it cannot be refreshed", () => {
    const sig = signPayload(secret, now, body);
    expect(verifySignature(secret, sig, String(now + 100), body, now + 100)).toBe(false);
  });
});

describe("endpoints", () => {
  it("shows the secret once, keeps it encrypted, lists no secret, and needs a safe address and an event", async () => {
    const k = await kitchen();
    const { endpoint: e, secret } = await endpoint(k, ["order.created"]);
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    const row = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: e.id } });
    expect(row.secretEnc).not.toContain(secret);
    expect(decryptSecret(row.secretEnc)).toBe(secret);
    const listed = JSON.stringify(await listWebhookEndpoints(k.orgId));
    expect(listed).not.toContain(secret);
    expect(listed).not.toContain("secretEnc");
    await expect(createWebhookEndpoint(k.orgId, { url: baseUrl, events: [] }, k.userId)).rejects.toThrow(/event/);
    await expect(createWebhookEndpoint(k.orgId, { url: baseUrl, events: ["nope.nothing"] }, k.userId)).rejects.toThrow(/event/);
    const saved = process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS;
    process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS = "false";
    await expect(createWebhookEndpoint(k.orgId, { url: "https://169.254.169.254/x", events: ALL }, k.userId)).rejects.toThrow(/private/);
    process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS = saved;
  });

  it("is limited to five, can be changed, rotated and deleted, and never touched by another kitchen", async () => {
    const [a, b] = [await kitchen("a"), await kitchen("b")];
    const mine = await endpoint(a);
    for (let i = 1; i < MAX_WEBHOOK_ENDPOINTS; i++) await endpoint(a);
    await expect(endpoint(a)).rejects.toThrow(/endpoints/);
    await expect(updateWebhookEndpoint(b.orgId, mine.endpoint.id, { isActive: false }, b.userId)).rejects.toThrow();
    await expect(rotateWebhookSecret(b.orgId, mine.endpoint.id, b.userId)).rejects.toThrow();
    await expect(deleteWebhookEndpoint(b.orgId, mine.endpoint.id, b.userId)).rejects.toThrow();
    expect(await listWebhookEndpoints(b.orgId)).toEqual([]);
    const before = (await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: mine.endpoint.id } })).secretEnc;
    const rotated = await rotateWebhookSecret(a.orgId, mine.endpoint.id, a.userId);
    const after = (await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: mine.endpoint.id } })).secretEnc;
    expect(after).not.toBe(before);
    expect(decryptSecret(after)).toBe(rotated.secret);
    const off = await updateWebhookEndpoint(a.orgId, mine.endpoint.id, { isActive: false, description: "paused" }, a.userId);
    expect([off.isActive, off.description]).toEqual([false, "paused"]);
    await deleteWebhookEndpoint(a.orgId, mine.endpoint.id, a.userId);
    expect(await prisma.webhookEndpoint.count({ where: { organizationId: a.orgId } })).toBe(MAX_WEBHOOK_ENDPOINTS - 1);
  });
});

describe("delivery", () => {
  it("posts a signed event the receiver can verify, with the same id in the header and the body", async () => {
    const k = await kitchen();
    const { endpoint: e, secret } = await endpoint(k, ["order.created"]);
    const [deliveryId] = await enqueue(k.orgId, "order.created", [e.id], { order: { id: "o1" } });
    // enqueue starts the first send itself; wait for it.
    await waitFor(() => prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } }), (d) => d.status !== "PENDING");
    expect(received).toHaveLength(1);
    const { headers, body } = received[0];
    expect(headers["x-platterly-event"]).toBe("order.created");
    expect(headers["content-type"]).toContain("application/json");
    expect(verifySignature(secret, String(headers["x-platterly-signature"]), String(headers["x-platterly-timestamp"]), body)).toBe(true);
    const parsed = JSON.parse(body);
    expect(parsed).toMatchObject({ id: headers["x-platterly-event-id"], type: "order.created", data: { order: { id: "o1" } } });
    expect(parsed.id).toMatch(/^evt_[a-f0-9]{32}$/);
    const done = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    expect([done.status, done.attempts, done.lastStatusCode]).toEqual(["DELIVERED", 1, 200]);
  });

  it("retries a 5xx with a growing delay, then delivers when the receiver recovers; the same event id is sent each time", async () => {
    const k = await kitchen();
    const { endpoint: e } = await endpoint(k, ["order.created"]);
    respondWith = 503;
    const [id] = await enqueue(k.orgId, "order.created", [e.id], { n: 1 });
    const first = await waitFor(() => prisma.webhookDelivery.findUniqueOrThrow({ where: { id } }), (d) => d.attempts >= 1 && d.nextAttemptAt !== null && d.nextAttemptAt.getTime() > Date.now() + 30_000);
    expect([first.status, first.attempts, first.lastStatusCode]).toEqual(["PENDING", 1, 503]);
    expect(first.nextAttemptAt!.getTime() - Date.now()).toBeLessThanOrEqual(RETRY_DELAYS_SECONDS[0] * 1000);
    expect(first.nextAttemptAt!.getTime() - Date.now()).toBeGreaterThan(RETRY_DELAYS_SECONDS[0] * 1000 - 5000);

    respondWith = 200;
    // Not due yet: the scheduled job leaves it alone. Then time passes.
    expect(await runDueWebhookDeliveries(new Date())).toBe(0);
    await prisma.webhookDelivery.update({ where: { id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    expect(await runDueWebhookDeliveries(new Date())).toBe(1);
    const second = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id } });
    expect([second.status, second.attempts]).toEqual(["DELIVERED", 2]);
    expect(received).toHaveLength(2);
    expect(received[0].headers["x-platterly-event-id"]).toBe(received[1].headers["x-platterly-event-id"]);
    expect(received[1].headers["x-platterly-signature"]).toBeTruthy(); // every attempt is signed afresh
  });

  it("gives up after the last retry and says so", async () => {
    const k = await kitchen();
    const { endpoint: e } = await endpoint(k, ["order.created"]);
    respondWith = 500;
    const [id] = await enqueue(k.orgId, "order.created", [e.id], { n: 1 });
    await waitFor(() => prisma.webhookDelivery.findUniqueOrThrow({ where: { id } }), (d) => d.attempts >= 1);
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await prisma.webhookDelivery.update({ where: { id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      await attemptDelivery(id);
    }
    const last = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id } });
    expect([last.status, last.attempts]).toEqual(["FAILED", MAX_ATTEMPTS]);
    expect(last.lastError).toContain(`Gave up after ${MAX_ATTEMPTS} tries`);
    expect(received).toHaveLength(MAX_ATTEMPTS);
    expect(await attemptDelivery(id)).toBe("skipped"); // a settled delivery is never sent again
  });

  it("does not retry what retrying cannot fix: a 4xx, a redirect, a switched-off endpoint", async () => {
    const k = await kitchen();
    const { endpoint: e } = await endpoint(k, ["order.created"]);
    respondWith = 400;
    const [bad] = await enqueue(k.orgId, "order.created", [e.id], { n: 1 });
    const failed = await waitFor(() => prisma.webhookDelivery.findUniqueOrThrow({ where: { id: bad } }), (d) => d.status !== "PENDING");
    expect([failed.status, failed.attempts, failed.lastStatusCode]).toEqual(["FAILED", 1, 400]);

    received = [];
    respondWith = 302;
    respondHeaders = { Location: "http://127.0.0.1:9/elsewhere" };
    const [redirect] = await enqueue(k.orgId, "order.created", [e.id], { n: 2 });
    const r = await waitFor(() => prisma.webhookDelivery.findUniqueOrThrow({ where: { id: redirect } }), (d) => d.status !== "PENDING");
    expect([r.status, r.lastStatusCode]).toEqual(["FAILED", 302]);
    expect(received).toHaveLength(1); // the redirect was not followed

    expect(classify(404).kind).toBe("failed");
    expect(classify(408).kind).toBe("retry");
    expect(classify(429).kind).toBe("retry");
    expect(classify(500).kind).toBe("retry");
    expect(classify(204).kind).toBe("delivered");

    received = [];
    await updateWebhookEndpoint(k.orgId, e.id, { isActive: false }, k.userId);
    const [off] = await enqueue(k.orgId, "order.created", [e.id], { n: 3 });
    await waitFor(() => prisma.webhookDelivery.findUniqueOrThrow({ where: { id: off } }), (d) => d.status !== "PENDING");
    received = [];
    await prisma.webhookDelivery.update({ where: { id: off }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date() } });
    expect(await attemptDelivery(off)).toBe("failed");
    expect(received).toHaveLength(0);
  });

  it("treats an unreachable receiver as temporary", async () => {
    const k = await kitchen();
    const { endpoint: e } = await endpoint(k, ["order.created"], "http://127.0.0.1:1/never");
    const [id] = await enqueue(k.orgId, "order.created", [e.id], { n: 1 });
    const d = await waitFor(() => prisma.webhookDelivery.findUniqueOrThrow({ where: { id } }), (x) => x.attempts >= 1 && x.lastError !== null);
    expect([d.status, d.lastError]).toEqual(["PENDING", "Could not reach the receiver."]);
  });

  it("sends a delivery only once even when two workers pick it up together", async () => {
    const k = await kitchen();
    const { endpoint: e } = await endpoint(k, ["order.created"]);
    const [id] = await enqueue(k.orgId, "order.created", [e.id], { n: 1 });
    await waitFor(() => prisma.webhookDelivery.findUniqueOrThrow({ where: { id } }), (d) => d.status !== "PENDING");
    received = [];
    await prisma.webhookDelivery.update({ where: { id }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date() } });
    const results = await Promise.all([attemptDelivery(id), attemptDelivery(id), attemptDelivery(id)]);
    expect(results.filter((r) => r !== "skipped")).toHaveLength(1);
    expect(received).toHaveLength(1);
  });

  it("switches an endpoint off after ten failures in a row, says why, and starts fresh when turned back on", async () => {
    const k = await kitchen();
    const { endpoint: e } = await endpoint(k, ["order.created"]);
    respondWith = 400;
    for (let i = 0; i < 10; i++) {
      const [id] = await enqueue(k.orgId, "order.created", [e.id], { n: i });
      await waitFor(() => prisma.webhookDelivery.findUniqueOrThrow({ where: { id } }), (d) => d.status !== "PENDING");
    }
    const off = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: e.id } });
    expect([off.isActive, off.consecutiveFailures]).toEqual([false, 10]);
    expect(off.disabledReason).toContain("10 failed deliveries");
    // Nothing more is queued for a switched-off endpoint.
    const customer = await createCustomer(k.orgId, { name: "N", phone: "+919800000001" }, k.userId);
    expect(customer.id).toBeTruthy();
    expect(await prisma.webhookDelivery.count({ where: { endpointId: e.id } })).toBe(10);
    const on = await updateWebhookEndpoint(k.orgId, e.id, { isActive: true }, k.userId);
    expect([on.isActive, on.consecutiveFailures, on.disabledReason]).toEqual([true, 0, null]);
  });

  it("lets the owner see the log, with no payload, and retry a failed delivery", async () => {
    const k = await kitchen();
    const { endpoint: e } = await endpoint(k, ["order.created"]);
    respondWith = 400;
    const [id] = await enqueue(k.orgId, "order.created", [e.id], { customer: { name: "Private Name" } });
    await waitFor(() => prisma.webhookDelivery.findUniqueOrThrow({ where: { id } }), (d) => d.status !== "PENDING");
    const log = await listDeliveries(k.orgId);
    expect(log[0]).toMatchObject({ id, eventName: "order.created", status: "FAILED", lastStatusCode: 400 });
    expect(JSON.stringify(log)).not.toContain("Private Name");
    respondWith = 200;
    await retryDelivery(k.orgId, id);
    await attemptDelivery(id);
    expect((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id } })).status).toBe("DELIVERED");
    await expect(retryDelivery(k.orgId, id)).rejects.toThrow(/failed/);
    const other = await kitchen("o");
    await expect(retryDelivery(other.orgId, id)).rejects.toThrow();
    expect(await listDeliveries(other.orgId)).toEqual([]);
  });
});

describe("real activity queues the right events", () => {
  const seen = async (orgId: string, name: string) => waitFor(() => prisma.webhookDelivery.findMany({ where: { organizationId: orgId, eventName: name }, orderBy: { createdAt: "asc" } }), (rows) => rows.length > 0 && rows.every((r) => r.status !== "PENDING"));

  it("sends customer, order, event and payment events as they happen, with small payloads and no contact details", async () => {
    const k = await kitchen();
    const { secret } = await endpoint(k);
    const customer = await createCustomer(k.orgId, { name: "Asha Rao", phone: "+919876500123", email: "asha@private.test" }, k.userId);
    await updateCustomer(k.orgId, customer.id, { name: "Asha R", phone: "+919876500123" }, k.userId);
    const eventType = await prisma.eventType.create({ data: { organizationId: k.orgId, name: "Wedding" } });
    const day = new Date("2031-05-01");
    const order = await createOrder(k.orgId, { customerId: customer.id, eventTypeId: eventType.id, eventStartDate: day, eventEndDate: day, totalParticipants: 10, adultCount: 1, individualPricingEnabled: true, mealPlanEntries: [{ date: day, mealType: "DINNER", price: 500 }] }, k.userId);
    await updateOrder(k.orgId, order.id, { customerId: customer.id, eventStartDate: day, eventEndDate: day, status: "APPROVED" }, k.userId);
    await createEvent(k.orgId, { customerId: customer.id, eventTypeId: eventType.id, name: "Direct event", startDate: day, endDate: day }, k.userId);
    const upi = await recordPayment({ organizationId: k.orgId, orderId: order.id, amount: 300, type: "ADVANCE", method: "UPI", source: "UPI_QR", actorUserId: k.userId });
    await confirmPayment(k.orgId, upi.id, k.userId);
    const second = await recordPayment({ organizationId: k.orgId, orderId: order.id, amount: 100, type: "PARTIAL", method: "UPI", source: "UPI_QR", actorUserId: k.userId });
    await rejectPayment(k.orgId, second.id, k.userId);

    for (const name of ["customer.created", "customer.updated", "order.created", "order.updated", "order.status_changed", "event.created", "payment.created", "payment.updated", "payment.failed"]) {
      const rows = await seen(k.orgId, name);
      expect(rows.length, name).toBeGreaterThanOrEqual(1);
      expect(rows.every((r) => r.status === "DELIVERED"), name).toBe(true);
    }
    expect((await seen(k.orgId, "payment.created")).length).toBe(2);
    const changed = (await seen(k.orgId, "order.status_changed"))[0].payload as { order: { status: string }; previous_status: string };
    expect([changed.previous_status, changed.order.status]).toEqual(["PENDING_REVIEW", "APPROVED"]);

    // Everything sent was signed, and none of it carries a phone number, email, note or payment reference.
    expect(received.length).toBeGreaterThan(8);
    for (const r of received) {
      expect(verifySignature(secret, String(r.headers["x-platterly-signature"]), String(r.headers["x-platterly-timestamp"]), r.body)).toBe(true);
      expect(r.body).not.toMatch(/asha@private|9876500123|razorpay|reference|\bnotes?\b|kitchen_?notes/i);
    }
    const customerEvent = JSON.parse(received.find((r) => r.headers["x-platterly-event"] === "customer.created")!.body);
    expect(Object.keys(customerEvent.data.customer).sort()).toEqual(["id", "is_active", "is_enquiry", "name"]);
  });

  it("queues only for subscribed, active endpoints of the same kitchen", async () => {
    const [a, b] = [await kitchen("a"), await kitchen("b")];
    const onlyOrders = await endpoint(a, ["order.created"]);
    const paused = await endpoint(a, ["customer.created"]);
    await updateWebhookEndpoint(a.orgId, paused.endpoint.id, { isActive: false }, a.userId);
    const bsHook = await endpoint(b, ["customer.created"]);
    await createCustomer(a.orgId, { name: "Only A", phone: "+919800000777" }, a.userId);
    await new Promise((r) => setTimeout(r, 300));
    expect(await prisma.webhookDelivery.count({ where: { endpointId: onlyOrders.endpoint.id } })).toBe(0); // not subscribed
    expect(await prisma.webhookDelivery.count({ where: { endpointId: paused.endpoint.id } })).toBe(0); // switched off
    expect(await prisma.webhookDelivery.count({ where: { endpointId: bsHook.endpoint.id } })).toBe(0); // another kitchen's
    expect(received).toHaveLength(0);
  });

  it("never lets a webhook problem fail the work that caused it", async () => {
    const k = await kitchen();
    const { endpoint: e } = await endpoint(k, ["customer.created"]);
    await prisma.webhookEndpoint.update({ where: { id: e.id }, data: { secretEnc: "garbage" } });
    const customer = await createCustomer(k.orgId, { name: "Still works", phone: "+919800000888" }, k.userId);
    expect(customer.name).toBe("Still works");
    const d = await waitFor(() => prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId: e.id } }), (x) => x.status !== "PENDING");
    expect([d.status, d.lastError]).toEqual(["FAILED", "The signing secret could not be read. Rotate the secret to fix it."]);
  });
});
