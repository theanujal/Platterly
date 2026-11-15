import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newId, requestTarget, signedHeaders } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { GET, PUT } from "@/app/api/products/[productKey]/businesses/[businessId]/billing-profile/route";

// A product saves and reads its OWN billing profile (its Business Profile page), signed with its own secret.
const KEY = "ownprofiletest";
const OTHER = "ownprofileother";
const BIZ = `biz_${"f".repeat(32)}`;
let secret = "";
let otherSecret = "";
const fields = { name: "Spice Route Caterers", brandName: "Spice Route", addressLine1: "12 MG Road", addressLine2: null, city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India", gstin: "27AAPFU0939F1ZV", description: "Weddings", website: "https://spice.example", logoUrl: "https://caterly.example/logo.png" };

const call = (handler: typeof GET | typeof PUT, productKey: string, method: string, body?: unknown, key = secret) => {
  const text = body === undefined ? "" : JSON.stringify(body);
  const url = `http://127.0.0.1:3200/api/products/${productKey}/businesses/${BIZ}/billing-profile`;
  return handler(new Request(url, { method, headers: signedHeaders(key, newId("command"), text, { target: requestTarget(method, url) }), body: text || undefined }), { params: Promise.resolve({ productKey, businessId: BIZ }) });
};
const wipe = async () => {
  await prisma.auditLog.deleteMany({ where: { subject: BIZ, action: "billing.profile_saved" } });
  await prisma.outboundCommand.deleteMany({ where: { businessId: BIZ } });
  await prisma.business.deleteMany({ where: { id: BIZ } });
  await prisma.product.deleteMany({ where: { key: { in: [KEY, OTHER] } } });
};
beforeEach(async () => {
  await wipe();
  secret = (await registerProduct({ key: KEY, name: "Own Profile", baseUrl: "http://127.0.0.1:9", actorUserId: null })).secrets.inbound;
  otherSecret = (await registerProduct({ key: OTHER, name: "Other", baseUrl: "http://127.0.0.1:9", actorUserId: null })).secrets.inbound;
  await prisma.business.create({ data: { id: BIZ, name: "Spice Route", products: { create: { productKey: KEY } } } });
});
afterEach(wipe);

describe("a product's own billing profile route", () => {
  it("reads null first, saves an incomplete profile as a product change, and never queues a push back", async () => {
    expect(await (await call(GET, KEY, "GET")).json()).toEqual({ profile: null });
    // The product's form has no billing contact, so the profile is saved without one.
    const saved = await call(PUT, KEY, "PUT", { baseVersion: null, fields });
    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body.profile).toMatchObject({ version: 1, source: "product", city: "Pune", contactName: null, logoUrl: fields.logoUrl });
    expect(await prisma.outboundCommand.count({ where: { businessId: BIZ, type: "billing_profile.set" } })).toBe(0);
    expect((await (await call(GET, KEY, "GET")).json()).profile.version).toBe(1);
  });

  it("refuses a stale save with the current record, and badly formed details", async () => {
    await call(PUT, KEY, "PUT", { baseVersion: null, fields });
    await call(PUT, KEY, "PUT", { baseVersion: 1, fields: { ...fields, city: "Mumbai" } });
    const stale = await call(PUT, KEY, "PUT", { baseVersion: 1, fields: { ...fields, city: "Goa" } });
    expect(stale.status).toBe(409);
    expect((await stale.json()).current).toMatchObject({ version: 2, city: "Mumbai" });
    expect((await call(PUT, KEY, "PUT", { baseVersion: 2, fields: { ...fields, gstin: "BAD" } })).status).toBe(400);
    expect((await call(PUT, KEY, "PUT", { baseVersion: 2, fields: { ...fields, postalCode: "12" } })).status).toBe(400);
  });

  it("answers unknown_business for a business that is on another product, and 401 for a wrong secret", async () => {
    expect((await call(GET, OTHER, "GET", undefined, otherSecret)).status).toBe(404);
    expect((await call(PUT, OTHER, "PUT", { baseVersion: null, fields }, otherSecret)).status).toBe(404);
    expect((await call(GET, KEY, "GET", undefined, "x".repeat(40))).status).toBe(401);
    expect(await prisma.productBillingProfile.count({ where: { businessId: BIZ } })).toBe(0);
  });
});
