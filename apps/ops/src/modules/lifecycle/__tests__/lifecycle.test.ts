import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, signedHeaders } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { createPlan } from "@/modules/plans/plans";
import { registerProduct } from "@/modules/registry/products";
import { LifecycleError, createBusiness, deleteBusiness, reactivateBusiness, restoreBusiness, setProvider, suspendBusiness, updateBusiness } from "../lifecycle";

const KEY = "lifetest";
let server: Server;
let baseUrl = "";
let inboundSecret = "";
let received: { type: string; businessId: string; payload: Record<string, unknown> }[] = [];
let reply: { status: number; body: Record<string, unknown> } = { status: 200, body: { ok: true } };

async function clean() {
  await prisma.messageLog.deleteMany({ where: { productKey: KEY } });
  await prisma.business.deleteMany({ where: { products: { some: { productKey: KEY } } } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}

const biz = () => prisma.business.findFirstOrThrow({ where: { products: { some: { productKey: KEY } } } });

async function trialPlan() {
  await createPlan({ productKey: KEY, code: "trial", name: "Trial", description: "", isTrial: true, trialDurationDays: 7, priceMonthly: null, priceAnnual: null, gstPercent: 18, highlights: [], entitlements: {} }, null);
}

async function existingBusiness(name = "Life Kitchen") {
  const id = newId("business");
  await prisma.business.create({ data: { id, name, ownerName: "Asha", ownerEmail: "asha@life.example.test", products: { create: { productKey: KEY } } } });
  return id;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const command = JSON.parse(body);
      received.push({ type: command.type, businessId: command.businessId, payload: command.payload });
      const text = JSON.stringify(reply.body);
      res.writeHead(reply.status, signedHeaders(inboundSecret, newId("command"), text));
      res.end(text);
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
  received = [];
  reply = { status: 200, body: { ok: true } };
  inboundSecret = (await registerProduct({ key: KEY, name: "Life Test", baseUrl, actorUserId: null })).secrets.inbound;
  // Plans are built from the product's manifest; this one declares no entitlements.
  const manifest = { contract: 1, productKey: KEY, name: "Life Test", version: "1", baseUrl, entitlements: [], trial: { days: 7, entitlements: {} } };
  await prisma.product.update({ where: { key: KEY }, data: { manifest, manifestVersion: "1" } });
});
afterEach(clean);

describe("createBusiness", () => {
  const input = { productKey: KEY, name: "New Kitchen", ownerName: "Ravi Kumar", ownerEmail: " Ravi@Example.Test " };

  it("creates the business and its trial here, then provisions it with the first snapshot inside the command", async () => {
    await trialPlan();
    const { businessId, delivered } = await createBusiness(input, null);
    expect(delivered).toBe(true);
    expect(await prisma.business.findUnique({ where: { id: businessId } })).toMatchObject({ name: "New Kitchen", ownerName: "Ravi Kumar", ownerEmail: "ravi@example.test" });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: "business.provision", businessId, payload: { businessName: "New Kitchen", ownerEmail: "ravi@example.test", ownerName: "Ravi Kumar", snapshot: { businessId, version: 1, status: "TRIALING" } } });
    // No separate snapshot.push went to a kitchen that did not exist yet.
    expect(received.some((r) => r.type === "snapshot.push")).toBe(false);
    expect(await prisma.businessProduct.findUniqueOrThrow({ where: { businessId_productKey: { businessId, productKey: KEY } } })).toMatchObject({ snapshotVersion: 1 });
    expect(await prisma.messageLog.findFirst({ where: { businessId, template: "welcome_owner" } })).not.toBeNull();
  });

  it("refuses bad input and a product with no trial plan before creating anything", async () => {
    await expect(createBusiness(input, null)).rejects.toThrow(/no active trial plan/);
    await trialPlan();
    await expect(createBusiness({ ...input, name: " " }, null)).rejects.toThrow(LifecycleError);
    await expect(createBusiness({ ...input, ownerEmail: "nope" }, null)).rejects.toThrow(/valid owner email/);
    await expect(createBusiness({ ...input, productKey: "nosuch" }, null)).rejects.toThrow(/active product/);
    expect(await prisma.business.count({ where: { products: { some: { productKey: KEY } } } })).toBe(0);
    expect(received).toHaveLength(0);
  });

  it("keeps the business and retries when the product cannot be reached, and surfaces a refusal", async () => {
    await trialPlan();
    reply = { status: 503, body: {} };
    const waiting = await createBusiness(input, null);
    expect(waiting.delivered).toBe(false);
    expect((await prisma.outboundCommand.findFirstOrThrow({ where: { productKey: KEY, type: "business.provision" } })).status).toBe("PENDING");
    reply = { status: 400, body: { ok: false, error: "bad snapshot" } };
    await expect(createBusiness({ ...input, name: "Second" }, null)).rejects.toThrow(/bad snapshot/);
  });
});

describe("changing a business", () => {
  it("update sends only the changed fields (owner name split) and keeps ops's billing email in step", async () => {
    const id = await existingBusiness();
    const result = await updateBusiness(id, KEY, { name: " Renamed ", ownerName: "Meera Devi Rao", ownerEmail: "NEW@life.example.test", slug: "" }, null);
    expect(result).toEqual({ ok: true, delivered: true });
    expect(received[0]).toMatchObject({ type: "business.update", payload: { businessName: "Renamed", ownerFirstName: "Meera", ownerLastName: "Devi Rao", ownerEmail: "new@life.example.test" } });
    expect(received[0].payload).not.toHaveProperty("slug");
    expect((await biz()).ownerEmail).toBe("new@life.example.test");
    await expect(updateBusiness(id, KEY, {}, null)).rejects.toThrow(/at least one/);
  });

  it("shows the product's reason when it refuses (a taken link) and changes nothing here", async () => {
    const id = await existingBusiness();
    reply = { status: 409, body: { ok: false, error: 'Slug "taken" is already in use.' } };
    const result = await updateBusiness(id, KEY, { ownerEmail: "x@life.example.test", slug: "taken" }, null);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("already in use") });
    expect((await biz()).ownerEmail).toBe("asha@life.example.test");
  });

  it("refuses a business that is not on the product", async () => {
    await expect(updateBusiness(newId("business"), KEY, { name: "x" }, null)).rejects.toThrow(/not on that product/);
  });

  it("suspend needs a reason; ops's status follows only once the product confirmed", async () => {
    const id = await existingBusiness();
    await expect(suspendBusiness(id, KEY, " ", null)).rejects.toThrow(/reason/);
    expect(await suspendBusiness(id, KEY, "non-payment", null)).toEqual({ ok: true, delivered: true });
    expect((await biz()).status).toBe("SUSPENDED");
    expect(received.at(-1)).toMatchObject({ type: "business.suspend", payload: { reason: "non-payment" } });
    reply = { status: 503, body: {} };
    expect(await reactivateBusiness(id, KEY, null)).toEqual({ ok: true, delivered: false });
    expect((await biz()).status).toBe("SUSPENDED");
    reply = { status: 200, body: { ok: true } };
    expect(await reactivateBusiness(id, KEY, null)).toEqual({ ok: true, delivered: true });
    expect((await biz()).status).toBe("ACTIVE");
  });

  it("delete needs the exact business name, then marks it pending deletion for 30 days, and restore undoes it", async () => {
    const id = await existingBusiness("Delete Kitchen");
    const now = new Date("2026-10-05T00:00:00Z");
    await expect(deleteBusiness(id, KEY, "delete kitchen!", null, now)).rejects.toThrow(/exactly/);
    expect(received).toHaveLength(0);
    expect(await deleteBusiness(id, KEY, "Delete Kitchen", null, now)).toEqual({ ok: true, delivered: true });
    expect(received[0]).toMatchObject({ type: "business.delete", payload: { confirmation: "Delete Kitchen", retentionDays: 30 } });
    expect(await biz()).toMatchObject({ status: "PENDING_DELETE", deleteAfter: new Date("2026-11-04T00:00:00Z") });
    expect(await restoreBusiness(id, KEY, null)).toEqual({ ok: true, delivered: true });
    expect(await biz()).toMatchObject({ status: "ACTIVE", deleteAfter: null });
    expect((await prisma.auditLog.findMany({ where: { subject: id }, select: { action: true } })).map((a) => a.action).sort()).toEqual(["business.delete_requested", "business.restored"]);
  });

  it("switches a message channel", async () => {
    const id = await existingBusiness();
    expect(await setProvider(id, KEY, "whatsapp", true, null)).toEqual({ ok: true, delivered: true });
    expect(received[0]).toMatchObject({ type: "provider.set", payload: { channel: "whatsapp", connected: true } });
  });
});
