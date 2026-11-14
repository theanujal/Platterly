import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, platformBillingProfilePath, requestTarget, signedHeaders, verifyRequest, type Buyer } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { GET as profileGET, PUT as profilePUT } from "@/app/api/platform/businesses/[businessId]/billing-profile/route";
import { URL_, pool, provisionKnown, requireScratchDatabase, reset } from "./helpers";

// A business's saved billing details, over the signed Platform routes: read with the read-only secret, saved with the billing secret. Runs only against a
// scratch database (the reader row is deleted); see helpers.ts.
const BIZ = `biz_${"a".repeat(32)}`;
const OTHER = `biz_${"b".repeat(32)}`;
const BILLING_SECRET = "platform-billing-secret-0123456789abcdef0123";
const buyer: Buyer = { name: "Spice Route Caterers", addressLine1: "12 MG Road", addressLine2: null, city: "Pune", state: "Maharashtra", postalCode: "411001", country: null, gstin: "27AAPFU0939F1ZV" };
let saved: string | undefined;
let reader = "";

const url = (biz: string) => URL_.replace("/api/platform/products", platformBillingProfilePath(biz));
const params = (biz: string) => ({ params: Promise.resolve({ businessId: biz }) });
const get = (secret: string | null, biz = BIZ) => profileGET(new Request(url(biz), { method: "GET", headers: secret === null ? {} : signedHeaders(secret, newId("command"), "", { target: requestTarget("GET", url(biz)) }) }), params(biz));
const put = (secret: string | null, body: unknown, biz = BIZ, signedFor = biz) => {
  const text = JSON.stringify(body);
  return profilePUT(new Request(url(biz), { method: "PUT", headers: secret === null ? {} : signedHeaders(secret, newId("command"), text, { target: requestTarget("PUT", url(signedFor)) }), body: text }), params(biz));
};
const stored = () => prisma.billingCustomer.findUnique({ where: { businessId: BIZ } });

async function clean() {
  await prisma.auditLog.deleteMany({ where: { action: "billing.profile_saved", subject: { in: [BIZ, OTHER] } } });
  await prisma.business.deleteMany({ where: { id: { in: [BIZ, OTHER] } } });
}

describe("billing profile routes", () => {
  beforeAll(async () => {
    requireScratchDatabase();
    saved = process.env.PLATFORM_BILLING_SECRETS;
    await clean();
    await reset();
  });
  beforeEach(async () => {
    process.env.PLATFORM_BILLING_SECRETS = BILLING_SECRET;
    await clean();
    await reset();
    reader = await provisionKnown();
    await prisma.business.create({ data: { id: BIZ, name: "PlrProfile Spice Route", ownerEmail: "o@example.test", ownerName: "O" } });
  });
  afterAll(async () => {
    try {
      await clean();
      await reset();
    } finally {
      if (saved === undefined) delete process.env.PLATFORM_BILLING_SECRETS;
      else process.env.PLATFORM_BILLING_SECRETS = saved;
      await pool.end();
    }
  });

  it("reads nothing for a business with no saved details, as a signed answer carrying the request's id", async () => {
    const res = await get(reader);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(verifyRequest([reader], res.headers, text).ok).toBe(true);
    expect(JSON.parse(text)).toEqual({ profile: null, updatedAt: null });
  });

  it("saves with the billing secret, and a read then returns the same details", async () => {
    const res = await put(BILLING_SECRET, { buyer });
    expect(res.status).toBe(200);
    expect(await stored()).toMatchObject({ name: "Spice Route Caterers", city: "Pune", gstin: "27AAPFU0939F1ZV", source: "account" });
    const read = (await (await get(reader)).json()) as { profile: Buyer; updatedAt: string };
    expect(read.profile).toEqual(buyer);
    expect(read.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("records who saved the details in the audit log", async () => {
    await put(BILLING_SECRET, { buyer, editedBy: "user-abc" });
    const entry = await prisma.auditLog.findFirst({ where: { action: "billing.profile_saved", subject: BIZ }, orderBy: { createdAt: "desc" } });
    expect(entry?.detail).toEqual({ source: "account", editedBy: "user-abc" });
  });

  it("saving again replaces the details rather than adding a second record", async () => {
    await put(BILLING_SECRET, { buyer });
    await put(BILLING_SECRET, { buyer: { ...buyer, city: "Mumbai", gstin: null } });
    expect(await prisma.billingCustomer.count({ where: { businessId: BIZ } })).toBe(1);
    expect(await stored()).toMatchObject({ city: "Mumbai", gstin: null });
  });

  it("refuses unsigned calls and the wrong secret: the read-only secret cannot save, the billing secret cannot read", async () => {
    expect((await get(null)).status).toBe(401);
    expect((await get(BILLING_SECRET)).status).toBe(401);
    expect((await put(null, { buyer })).status).toBe(401);
    expect((await put(reader, { buyer })).status).toBe(401);
    expect(await stored()).toBeNull();
  });

  it("refuses when no billing secret is set, and a signature made for another business's route", async () => {
    delete process.env.PLATFORM_BILLING_SECRETS;
    expect((await put(BILLING_SECRET, { buyer })).status).toBe(401);
    process.env.PLATFORM_BILLING_SECRETS = BILLING_SECRET;
    expect((await put(BILLING_SECRET, { buyer }, BIZ, OTHER)).status).toBe(401);
    expect(await stored()).toBeNull();
  });

  it("an unknown business is 404 for both calls, and nothing is created", async () => {
    await prisma.business.create({ data: { id: OTHER, name: "PlrProfile Other", ownerEmail: "p@example.test", ownerName: "P" } });
    await prisma.business.delete({ where: { id: OTHER } });
    expect((await get(reader, OTHER)).status).toBe(404);
    expect((await put(BILLING_SECRET, { buyer }, OTHER)).status).toBe(404);
    expect((await get(reader, "not-an-id")).status).toBe(404);
    expect(await prisma.billingCustomer.count({ where: { businessId: OTHER } })).toBe(0);
  });

  it("refuses details the forms would refuse, saving nothing: a bad GSTIN, a short PIN, a missing address, not JSON", async () => {
    expect((await put(BILLING_SECRET, { buyer: { ...buyer, gstin: "123" } })).status).toBe(400);
    expect((await put(BILLING_SECRET, { buyer: { ...buyer, postalCode: "41" } })).status).toBe(400);
    expect((await put(BILLING_SECRET, { buyer: { ...buyer, addressLine1: "" } })).status).toBe(400);
    expect((await put(BILLING_SECRET, { nonsense: true })).status).toBe(400);
    expect(await stored()).toBeNull();
  });

  it("saves a GSTIN typed in lower case in capitals", async () => {
    await put(BILLING_SECRET, { buyer: { ...buyer, gstin: "27aapfu0939f1zv" } });
    expect((await stored())?.gstin).toBe("27AAPFU0939F1ZV");
  });

  it("deleting the business removes its saved details", async () => {
    await put(BILLING_SECRET, { buyer });
    await prisma.business.delete({ where: { id: BIZ } });
    expect(await stored()).toBeNull();
  });
});
