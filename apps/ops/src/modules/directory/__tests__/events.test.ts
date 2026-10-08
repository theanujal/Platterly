import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, signedHeaders } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct, rotateSecrets } from "@/modules/registry/products";
import { receiveEvent } from "../events";

const A = "evtesta";
const B = "evtestb";

let secretA = "";

function event(type: string, data: unknown, over: Record<string, unknown> = {}) {
  return { eventId: newId("event"), productKey: A, businessId: newId("business"), occurredAt: new Date().toISOString(), type, data, ...over };
}

async function send(body: Record<string, unknown>, opts: { secret?: string; id?: string; tamper?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const headers = new Headers(signedHeaders(opts.secret ?? secretA, opts.id ?? String(body.eventId), raw));
  return receiveEvent(opts.tamper ? raw.replace("Spice", "Spicy") : raw, headers);
}

async function clean() {
  await prisma.messageLog.deleteMany({ where: { productKey: { in: [A, B] } } });
  await prisma.business.deleteMany({ where: { name: { startsWith: "EvTest" } } });
  await prisma.product.deleteMany({ where: { key: { in: [A, B] } } });
}

const signup = (over: Record<string, unknown> = {}, name = "EvTest Spice Co") => event("business.signed_up", { businessName: name, ownerName: "Asha", ownerEmail: "asha@example.com" }, over);

describe("receiveEvent", () => {
  beforeAll(clean);
  beforeEach(async () => {
    await clean();
    secretA = (await registerProduct({ key: A, name: "Evtest A", baseUrl: "http://127.0.0.1:1", actorUserId: null })).secrets.inbound;
    await registerProduct({ key: B, name: "Evtest B", baseUrl: "http://127.0.0.1:2", actorUserId: null });
  });
  afterAll(clean);

  it("creates the business, links it to the product and raises an info notification on sign-up", async () => {
    const body = signup();
    const reply = await send(body);
    expect(reply.status).toBe(200);
    const business = await prisma.business.findUniqueOrThrow({ where: { id: String(body.businessId) }, include: { products: true } });
    expect(business.name).toBe("EvTest Spice Co");
    expect(business.ownerEmail).toBe("asha@example.com");
    expect(business.products.map((p) => p.productKey)).toEqual([A]);
    expect(await prisma.notification.count({ where: { businessId: business.id, kind: "business.signed_up", severity: "INFO" } })).toBe(1);
  });

  it("accepts the same event twice but applies it once (a retry reuses the event id)", async () => {
    const body = signup();
    expect((await send(body)).status).toBe(200);
    const again = await send(body);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ duplicate: true });
    expect(await prisma.notification.count({ where: { businessId: String(body.businessId) } })).toBe(1);
    expect(await prisma.inboundEvent.count({ where: { eventId: String(body.eventId) } })).toBe(1);
  });

  it("refuses a bad signature, a tampered body, a stale timestamp and an unknown or disabled product (all look the same)", async () => {
    const body = signup();
    expect((await send(body, { secret: "wrong" })).status).toBe(401);
    expect((await send(body, { tamper: true })).status).toBe(401);
    expect((await send({ ...body, productKey: "evtest-nobody" })).status).toBe(401);

    const raw = JSON.stringify(body);
    const stale = new Headers(signedHeaders(secretA, String(body.eventId), raw, Math.floor(Date.now() / 1000) - 3600));
    expect((await receiveEvent(raw, stale)).status).toBe(401);

    await prisma.product.update({ where: { key: A }, data: { status: "DISABLED" } });
    expect((await send(body)).status).toBe(401);
    expect(await prisma.business.count({ where: { id: String(body.businessId) } })).toBe(0);
  });

  it("answers 400 for a body that is not JSON or not a valid event, and when the header id disagrees", async () => {
    expect((await receiveEvent("nope", new Headers())).status).toBe(400);
    expect((await send(event("usage.reported", { periodStart: "bad", counts: {} }))).status).toBe(400);
    expect((await send(signup(), { id: newId("event") })).status).toBe(400);
  });

  it("accepts the old secret during a rotation and refuses it afterwards", async () => {
    const fresh = (await rotateSecrets(A, null)).inbound;
    expect((await send(signup(), { secret: secretA })).status).toBe(200);
    expect((await send(signup(), { secret: fresh })).status).toBe(200);
    await prisma.product.update({ where: { key: A }, data: { inboundSecretPrevious: null } });
    expect((await send(signup(), { secret: secretA })).status).toBe(401);
  });

  it("stores usage counts for a business the product owns", async () => {
    const su = signup();
    await send(su);
    const usage = event("usage.reported", { periodStart: "2026-10-05T00:00:00.000Z", counts: { customers: 4, orders: 9 } }, { businessId: su.businessId });
    expect((await send(usage)).status).toBe(200);
    const row = await prisma.businessProduct.findUniqueOrThrow({ where: { businessId_productKey: { businessId: String(su.businessId), productKey: A } } });
    expect((row.usage as { counts: Record<string, number> }).counts).toEqual({ customers: 4, orders: 9 });
    expect(row.usageReportedAt).not.toBeNull();
  });

  it("a product cannot change a business that belongs to another product", async () => {
    const su = signup();
    await send(su);
    const secretB = (await rotateSecrets(B, null)).inbound;
    const hijack = event("owner.changed", { ownerEmail: "evil@example.com" }, { businessId: su.businessId, productKey: B });
    const reply = await send(hijack, { secret: secretB });
    expect(reply.status).toBe(202);
    expect(reply.body).toMatchObject({ applied: false });
    expect((await prisma.business.findUniqueOrThrow({ where: { id: String(su.businessId) } })).ownerEmail).toBe("asha@example.com");
    expect((await prisma.inboundEvent.findUniqueOrThrow({ where: { eventId: String(hijack.eventId) } })).error).toMatch(/unknown business/);
  });

  it("updates the owner email, and raises notifications with their severity", async () => {
    const su = signup();
    await send(su);
    await send(event("owner.changed", { ownerEmail: "new@example.com" }, { businessId: su.businessId }));
    expect((await prisma.business.findUniqueOrThrow({ where: { id: String(su.businessId) } })).ownerEmail).toBe("new@example.com");
    await send(event("alert.raised", { severity: "critical", code: "db.down", message: "Database unreachable" }, { businessId: su.businessId }));
    expect(await prisma.notification.count({ where: { businessId: String(su.businessId), severity: "CRITICAL", kind: "db.down" } })).toBe(1);
  });

  it("a repeated sign-up raises no second notification, and business.updated renames the business", async () => {
    const su = signup();
    await send(su);
    await send(signup({ businessId: su.businessId }));
    expect(await prisma.notification.count({ where: { businessId: String(su.businessId), kind: "business.signed_up" } })).toBe(1);
    expect((await send(event("business.updated", { businessName: "EvTest Renamed", ownerName: "Asha K" }, { businessId: su.businessId }))).status).toBe(200);
    const business = await prisma.business.findUniqueOrThrow({ where: { id: String(su.businessId) } });
    expect(business.name).toBe("EvTest Renamed");
    expect(business.ownerName).toBe("Asha K");
    const other = await send(event("business.updated", { businessName: "EvTest Hijack" }, { businessId: su.businessId, productKey: B }), { secret: (await rotateSecrets(B, null)).inbound });
    expect(other.status).toBe(202);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: String(su.businessId) } })).name).toBe("EvTest Renamed");
  });

  it("a backfilled business is recorded without a sign-up notification", async () => {
    const body = event("business.signed_up", { businessName: "EvTest Old Kitchen", ownerName: "Asha", ownerEmail: "old@example.com", backfill: true });
    expect((await send(body)).status).toBe(200);
    expect(await prisma.business.count({ where: { id: String(body.businessId) } })).toBe(1);
    expect(await prisma.notification.count({ where: { businessId: String(body.businessId) } })).toBe(0);
  });

  it("sends a message request through ops and logs it", async () => {
    const su = signup();
    await send(su);
    const msg = event("message.requested", { template: "welcome_owner", variables: { name: "Asha" } }, { businessId: su.businessId });
    const reply = await send(msg);
    // Accepted and recorded; with no mail provider in tests the message is logged as skipped, not lost.
    expect(reply.status).toBe(200);
    expect((await prisma.inboundEvent.findUniqueOrThrow({ where: { eventId: String(msg.eventId) } })).processedAt).not.toBeNull();
    expect(await prisma.messageLog.findFirst({ where: { businessId: su.businessId, template: "welcome_owner" } })).toMatchObject({ status: "SKIPPED", dedupeKey: `event:${msg.eventId}` });
    // A template ops does not have is the product's mistake: 202 with the reason, nothing logged.
    const bad = event("message.requested", { template: "no_such_template", variables: {} }, { businessId: su.businessId });
    const badReply = await send(bad);
    expect(badReply.status).toBe(202);
    expect((await prisma.inboundEvent.findUniqueOrThrow({ where: { eventId: String(bad.eventId) } })).error).toMatch(/unknown template/);
    expect(await prisma.messageLog.count({ where: { businessId: su.businessId } })).toBe(1);
  });

  it("a second product can join an existing business without overwriting it", async () => {
    const su = signup();
    await send(su);
    const secretB = (await rotateSecrets(B, null)).inbound;
    const join = event("business.signed_up", { businessName: "EvTest Different Name", ownerName: "Other", ownerEmail: "other@example.com" }, { businessId: su.businessId, productKey: B });
    expect((await send(join, { secret: secretB })).status).toBe(200);
    const business = await prisma.business.findUniqueOrThrow({ where: { id: String(su.businessId) }, include: { products: true } });
    expect(business.name).toBe("EvTest Spice Co");
    expect(business.products.map((p) => p.productKey).sort()).toEqual([A, B]);
  });
});
