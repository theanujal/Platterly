import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newId, platformProductBillingProfilePath, platformProductBillingProfilesPath, requestTarget, signedHeaders } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { GET as listGET } from "@/app/api/platform/businesses/[businessId]/billing-profiles/route";
import { PUT as profilePUT } from "@/app/api/platform/businesses/[businessId]/billing-profiles/[productKey]/route";

// The per-product billing profile routes. Runs against the Ops dev database with its own business, removed after each test.
const BIZ = `biz_${"d".repeat(32)}`;
const BASE = "http://ops.localhost:3200";
const SECRET = "platform-billing-secret-0123456789abcdef0123";
const READER = "x".repeat(40);
const saved: Record<string, string | undefined> = {};
const fields = { name: "Spice Route Caterers", brandName: "Spice Route", contactName: "Asha Rao", contactEmail: "asha@example.com", contactPhone: "9876543210", addressLine1: "12 MG Road", addressLine2: null, city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India", gstin: "27AAPFU0939F1ZV", description: "Weddings", website: "https://spice.example", instagram: null, facebook: null, logoUrl: "https://caterly.example/logo.png" };

const put = (productKey: string, body: unknown, secret: string | null = SECRET) => {
  const url = `${BASE}${platformProductBillingProfilePath(BIZ, productKey)}`;
  const text = JSON.stringify(body);
  return profilePUT(new Request(url, { method: "PUT", body: text, headers: secret ? signedHeaders(secret, newId("command"), text, { target: requestTarget("PUT", url) }) : {} }), { params: Promise.resolve({ businessId: BIZ, productKey }) });
};
const list = (secret: string | null = READER) => {
  const url = `${BASE}${platformProductBillingProfilesPath(BIZ)}`;
  return listGET(new Request(url, { method: "GET", headers: secret ? signedHeaders(secret, newId("command"), "", { target: requestTarget("GET", url) }) : {} }), { params: Promise.resolve({ businessId: BIZ }) });
};
const PUSH_KEY = "billpushtest";
const wipe = async () => {
  await prisma.outboundCommand.deleteMany({ where: { productKey: PUSH_KEY } });
  await prisma.auditLog.deleteMany({ where: { subject: BIZ, action: "billing.profile_saved" } });
  await prisma.business.deleteMany({ where: { id: BIZ } });
  await prisma.product.deleteMany({ where: { key: PUSH_KEY } });
};

beforeAll(() => { saved.b = process.env.PLATFORM_BILLING_SECRETS; });
beforeEach(async () => { process.env.PLATFORM_BILLING_SECRETS = SECRET; await wipe(); await prisma.business.create({ data: { id: BIZ, name: "Spice Route" } }); });
afterEach(wipe);
afterAll(() => {
  for (const [k, v] of [["PLATFORM_BILLING_SECRETS", saved.b]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

describe("per-product billing profile routes", () => {
  it("saves a first profile, then a versioned change, and refuses a stale one with the current record", async () => {
    const first = await put("caterly", { baseVersion: null, source: "account", editedBy: "u1", fields });
    expect(first.status).toBe(200);
    expect((await first.json()).profile.version).toBe(1);
    const second = await put("caterly", { baseVersion: 1, source: "product", fields: { ...fields, city: "Mumbai" } });
    expect((await second.json()).profile.version).toBe(2);
    const stale = await put("caterly", { baseVersion: 1, source: "account", fields: { ...fields, city: "Chennai" } });
    expect(stale.status).toBe(409);
    const body = await stale.json();
    expect(body.current.city).toBe("Mumbai");
    expect(body.current.version).toBe(2);
  });

  it("keeps products apart and copies one into another", async () => {
    await put("caterly", { baseVersion: null, source: "account", fields });
    const copy = await put("rivo", { baseVersion: null, source: "account", copyFrom: "caterly" });
    expect(copy.status).toBe(200);
    expect((await copy.json()).profile.logoUrl).toBe(fields.logoUrl);
    expect((await put("rivo", { baseVersion: 1, source: "account", copyFrom: "rivo" })).status).toBe(400);
    expect((await put("rivo", { baseVersion: 1, source: "account", copyFrom: "nothing" })).status).toBe(400);
  });

  it("rejects bad details like the forms do, and an unsigned or wrongly signed call", async () => {
    expect((await put("caterly", { baseVersion: null, source: "account", fields: { ...fields, gstin: "BAD" } })).status).toBe(400);
    expect((await put("caterly", { baseVersion: null, source: "account", fields: { ...fields, website: "not a link" } })).status).toBe(400);
    expect((await put("caterly", { baseVersion: null, source: "account", fields }, null)).status).toBe(401);
    expect((await put("caterly", { baseVersion: null, source: "account", fields }, "x".repeat(40))).status).toBe(401);
    expect(await prisma.productBillingProfile.count({ where: { businessId: BIZ } })).toBe(0);
  });

  it("answers 404 for an unknown business and requires the reader secret to list", async () => {
    const url = `${BASE}${platformProductBillingProfilePath(`biz_${"e".repeat(32)}`, "caterly")}`;
    const text = JSON.stringify({ baseVersion: null, source: "account", fields });
    const res = await profilePUT(new Request(url, { method: "PUT", body: text, headers: signedHeaders(SECRET, newId("command"), text, { target: requestTarget("PUT", url) }) }), { params: Promise.resolve({ businessId: `biz_${"e".repeat(32)}`, productKey: "caterly" }) });
    expect(res.status).toBe(404);
    expect((await list(null)).status).toBe(401);
  });

  it("queues one billing_profile.set command to the product for an Account save, and none for a product's own save", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await registerProduct({ key: PUSH_KEY, name: "Push Test", baseUrl: "http://127.0.0.1:9", actorUserId: null });
      await prisma.businessProduct.create({ data: { businessId: BIZ, productKey: PUSH_KEY } });
      expect((await put(PUSH_KEY, { baseVersion: null, source: "account", fields })).status).toBe(200);
      let rows = await prisma.outboundCommand.findMany({ where: { productKey: PUSH_KEY, type: "billing_profile.set" } });
      expect(rows).toHaveLength(1);
      expect(rows[0].dedupeKey).toBe(`billing-profile:${BIZ}:${PUSH_KEY}:1`);
      expect((rows[0].payload as { payload: { profile: { version: number; city: string } } }).payload.profile).toMatchObject({ version: 1, city: "Pune" });
      // The same values saved again are not a new version, so nothing more is queued; a product's own save is never pushed back.
      expect((await put(PUSH_KEY, { baseVersion: 1, source: "account", fields })).status).toBe(200);
      expect((await put(PUSH_KEY, { baseVersion: 1, source: "product", fields: { ...fields, city: "Goa" } })).status).toBe(200);
      rows = await prisma.outboundCommand.findMany({ where: { productKey: PUSH_KEY, type: "billing_profile.set" } });
      expect(rows).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
