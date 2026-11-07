import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, parsePlatformBusinessBilling, parsePlatformPlanCatalogue, platformBillingPath, requestTarget, signedHeaders, verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { handleBusinessBillingRequest, handlePlanCatalogueRequest } from "../platform-plans";
import { URL_, pool, provisionKnown, requireScratchDatabase, reset } from "./helpers";

const PLANS_URL = URL_.replace("/api/platform/products", "/api/platform/plans");

const BIZ = `biz_${"c".repeat(32)}`;
const UNKNOWN = `biz_${"d".repeat(32)}`;
async function clean() {
  await prisma.subscriptionPayment.deleteMany({ where: { businessId: BIZ } });
  await prisma.subscription.deleteMany({ where: { businessId: BIZ } });
  await prisma.businessProduct.deleteMany({ where: { businessId: BIZ } });
  await prisma.business.deleteMany({ where: { id: BIZ } });
  await prisma.plan.deleteMany({ where: { productKey: { startsWith: "plrplan" } } });
  await prisma.product.deleteMany({ where: { key: { startsWith: "plrplan" } } });
}
const get = (secret: string | null, url = PLANS_URL, target = url) =>
  handlePlanCatalogueRequest(new Request(url, { method: "GET", headers: secret === null ? {} : signedHeaders(secret, newId("command"), "", { target: requestTarget("GET", target) }) }));

// Runs only against a scratch database (see helpers.ts): it deletes the platform_reader row.
describe("platform plan catalogue (Store first slice)", () => {
  beforeAll(async () => {
    requireScratchDatabase();
    await clean();
    await reset();
  });
  beforeEach(async () => {
    await clean();
    await reset();
  });
  afterAll(async () => {
    try {
      await clean();
      await reset();
    } finally {
      await pool.end();
    }
  });

  async function seed() {
    await registerProduct({ key: "plrplan", name: "Plr Plan", baseUrl: "https://plrplan.example.com", actorUserId: null });
    await registerProduct({ key: "plrplanoff", name: "Plr Plan Off", baseUrl: "https://plrplanoff.example.com", actorUserId: null });
    await prisma.product.update({ where: { key: "plrplanoff" }, data: { status: "DISABLED" } });
    const base = { priceAnnual: null, gstPercent: 18, highlights: [] as string[] };
    await prisma.plan.create({ data: { productKey: "plrplan", code: "growth", name: "Growth", description: "d", priceMonthly: 2500, priceAnnual: 25000, gstPercent: 18, highlights: ["x", "y"] } });
    await prisma.plan.create({ data: { productKey: "plrplan", code: "starter", name: "Starter", priceMonthly: 1000, ...base } });
    await prisma.plan.create({ data: { productKey: "plrplan", code: "trial", name: "Trial", isTrial: true, priceMonthly: null, ...base } });
    await prisma.plan.create({ data: { productKey: "plrplan", code: "old", name: "Old", isActive: false, priceMonthly: 500, ...base } });
    await prisma.plan.create({ data: { productKey: "plrplanoff", code: "any", name: "Any", priceMonthly: 700, ...base } });
  }

  it("answers a signed request with a signed, schema-valid catalogue of sellable plans only, cheapest first", async () => {
    const sign = await provisionKnown();
    await seed();
    const res = await get(sign);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(verifyRequest([sign], res.headers, text).ok).toBe(true);
    const parsed = parsePlatformPlanCatalogue(JSON.parse(text));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const mine = parsed.value.products.find((p) => p.productKey === "plrplan");
    expect(mine?.plans.map((p) => p.code)).toEqual(["starter", "growth"]);
    expect(mine?.plans[1]).toMatchObject({ name: "Growth", highlights: ["x", "y"], monthly: { amount: 2500, gstPercent: 18, gstAmount: 450, total: 2950 }, annual: { amount: 25000, total: 29500 } });
    expect(mine?.plans[0].annual).toBeNull();
    expect(parsed.value.products.some((p) => p.productKey === "plrplanoff")).toBe(false);
    // Nothing but price information leaves Ops.
    expect(text).not.toMatch(/secret|baseUrl|entitlements|subscription|businessId/i);
  });

  it("answers the same 401 to an unsigned request, a wrong secret, a request signed for another route, and before any secret exists", async () => {
    expect((await get(null)).status).toBe(401);
    const sign = await provisionKnown();
    expect((await get(null)).status).toBe(401);
    expect((await get("not-the-secret-0123456789abcdef0123456789abcdef")).status).toBe(401);
    expect((await get(sign, PLANS_URL, URL_)).status).toBe(401);
    expect((await handlePlanCatalogueRequest(new Request(PLANS_URL, { method: "POST", headers: signedHeaders(sign, newId("command"), "", { target: requestTarget("GET", PLANS_URL) }) }))).status).toBe(401);
  });

  it("answers 401 to everyone until a secret has been provisioned", async () => {
    expect((await get("any-secret-0123456789abcdef0123456789abcdef")).status).toBe(401);
  });

  describe("one business's billing", () => {
    const url = (id: string) => `https://ops.example.com${platformBillingPath(id)}`;
    const ask = (secret: string | null, id: string, u = url(id), target = u) =>
      handleBusinessBillingRequest(new Request(u, { method: "GET", headers: secret === null ? {} : signedHeaders(secret, newId("command"), "", { target: requestTarget("GET", target) }) }), id);

    async function seedBusiness() {
      await seed();
      const plan = await prisma.plan.findFirstOrThrow({ where: { productKey: "plrplan", code: "growth" } });
      await prisma.business.create({ data: { id: BIZ, name: "Plr Biz" } });
      await prisma.businessProduct.create({ data: { businessId: BIZ, productKey: "plrplan" } });
      await prisma.subscription.create({ data: { id: `sub_${"c".repeat(32)}`, businessId: BIZ, productKey: "plrplan", planId: plan.id, status: "ACTIVE", billingInterval: "MONTHLY", currentPeriodEnd: new Date("2026-12-01T00:00:00Z") } });
      await prisma.subscriptionPayment.create({ data: { id: `pay_${"c".repeat(32)}`, businessId: BIZ, productKey: "plrplan", planId: plan.id, interval: "MONTHLY", amount: 2500, gstPercent: 18, gstAmount: 450, total: 2950, status: "PAID", paidAt: new Date("2026-11-01T00:00:00Z"), invoiceNumber: "PLR-INV-1" } });
      await prisma.subscriptionPayment.create({ data: { id: `pay_${"d".repeat(32)}`, businessId: BIZ, productKey: "plrplan", planId: plan.id, interval: "MONTHLY", amount: 2500, gstPercent: 18, gstAmount: 450, total: 2950, status: "PENDING" } });
    }

    it("answers a signed request with the business's subscription and paid payments only, signed and schema-valid", async () => {
      const sign = await provisionKnown();
      await seedBusiness();
      const res = await ask(sign, BIZ);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(verifyRequest([sign], res.headers, text).ok).toBe(true);
      const parsed = parsePlatformBusinessBilling(JSON.parse(text));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.value.businessId).toBe(BIZ);
      const mine = parsed.value.products.find((p) => p.productKey === "plrplan");
      expect(mine?.billing.subscription).toMatchObject({ status: "ACTIVE", plan: { name: "Growth" }, billingInterval: "MONTHLY" });
      expect(mine?.billing.payments).toHaveLength(1);
      expect(mine?.billing.payments[0]).toMatchObject({ total: 2950, invoiceNumber: "PLR-INV-1" });
      expect(text).not.toMatch(/razorpay|buyer|invoiceSnapshot|secret/i);
    });

    it("answers 404 (after authentication) for an unknown or malformed business id, and 401 for every bad signature", async () => {
      const sign = await provisionKnown();
      await seedBusiness();
      expect((await ask(sign, UNKNOWN)).status).toBe(404);
      expect((await ask(sign, "not-an-id", "https://ops.example.com/api/platform/businesses/not-an-id/billing")).status).toBe(404);
      expect((await ask(null, BIZ)).status).toBe(401);
      expect((await ask("not-the-secret-0123456789abcdef0123456789abcdef", BIZ)).status).toBe(401);
      // Signed for one business, sent for another: the path is part of the signature.
      expect((await ask(sign, BIZ, url(BIZ), url(UNKNOWN))).status).toBe(401);
      // Signed for the plan catalogue, replayed against the billing route.
      expect((await ask(sign, BIZ, url(BIZ), PLANS_URL)).status).toBe(401);
    });

    it("answers 401 to everyone, even for a known business, until a secret has been provisioned", async () => {
      await seedBusiness();
      expect((await ask("any-secret-0123456789abcdef0123456789abcdef", BIZ)).status).toBe(401);
    });
  });
});
