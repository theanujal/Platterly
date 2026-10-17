import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { buildBundle } from "@/modules/site-content/site-content";
import { PlanError, createPlan, setPlanActive, updatePlan, type PlanInput } from "../plans";
import { ensureCateringProduct } from "./catering-product";

/**
 * The featured plan ("Most popular" on the website): at most one per product, only an active, non-trial plan with a monthly
 * price, cleared when it stops being one. The tests share the dev database, so a real featured plan and the real "changed"
 * marker are put back afterwards and every row made here is removed. On an empty migrated database (CI) the "catering" product
 * is added first and removed again afterwards (see catering-product.ts); a real one is never touched.
 */
const CODES = ["sitetest-feat-a", "sitetest-feat-b", "sitetest-feat-t"];
const input = (code: string, over: Partial<PlanInput> = {}): PlanInput => ({ productKey: "catering", code, name: `Feat ${code}`, description: "d", isTrial: false, priceMonthly: 500, priceAnnual: 5000, gstPercent: 18, highlights: ["One"], entitlements: {}, ...over });

let releaseProduct: () => Promise<void>;
let realFeatured: string[] = [];
let savedMarker: Awaited<ReturnType<typeof prisma.siteSetting.findUnique>>;
const featuredOf = async (code: string) => (await prisma.plan.findFirstOrThrow({ where: { productKey: "catering", code } })).isFeatured;
const marker = async () => (await prisma.siteSetting.findUnique({ where: { key: "changed" } }))?.value as { at: string } | undefined;
const resetMarker = () => prisma.siteSetting.deleteMany({ where: { key: "changed" } });

async function removePlans() {
  const rows = await prisma.plan.findMany({ where: { code: { in: CODES } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { subject: { in: rows.map((r) => r.id) } } });
  await prisma.plan.deleteMany({ where: { code: { in: CODES } } });
}

beforeAll(async () => {
  releaseProduct = await ensureCateringProduct();
  savedMarker = await prisma.siteSetting.findUnique({ where: { key: "changed" } });
  await removePlans();
  realFeatured = (await prisma.plan.findMany({ where: { productKey: "catering", isFeatured: true }, select: { id: true } })).map((p) => p.id);
  await prisma.plan.updateMany({ where: { id: { in: realFeatured } }, data: { isFeatured: false } });
});
afterEach(async () => {
  await removePlans();
  await resetMarker();
});
afterAll(async () => {
  await removePlans();
  await prisma.plan.updateMany({ where: { id: { in: realFeatured } }, data: { isFeatured: true } });
  if (savedMarker) await prisma.siteSetting.upsert({ where: { key: "changed" }, create: { key: "changed", value: savedMarker.value as object }, update: { value: savedMarker.value as object } });
  else await resetMarker();
  await releaseProduct();
});

describe("featured plan", () => {
  it("every plan starts unfeatured", async () => {
    const a = await createPlan(input("sitetest-feat-a"), null);
    expect(a.isFeatured).toBe(false);
  });

  it("featuring a plan clears the product's other featured plan in the same save", async () => {
    await createPlan(input("sitetest-feat-a", { isFeatured: true }), null);
    expect(await featuredOf("sitetest-feat-a")).toBe(true);
    const b = await createPlan(input("sitetest-feat-b"), null);
    await updatePlan(b.id, input("sitetest-feat-b", { isFeatured: true }), null);
    expect(await featuredOf("sitetest-feat-a")).toBe(false);
    expect(await featuredOf("sitetest-feat-b")).toBe(true);
    expect(await prisma.plan.count({ where: { productKey: "catering", isFeatured: true } })).toBe(1);
  });

  it("a save that leaves the flag out keeps it; unticking clears it", async () => {
    const a = await createPlan(input("sitetest-feat-a", { isFeatured: true }), null);
    await updatePlan(a.id, input("sitetest-feat-a", { name: "Renamed" }), null);
    expect(await featuredOf("sitetest-feat-a")).toBe(true);
    await updatePlan(a.id, input("sitetest-feat-a", { isFeatured: false }), null);
    expect(await featuredOf("sitetest-feat-a")).toBe(false);
  });

  it("the database refuses a second featured plan for a product even when the code is bypassed", async () => {
    await createPlan(input("sitetest-feat-a", { isFeatured: true }), null);
    const b = await createPlan(input("sitetest-feat-b"), null);
    await expect(prisma.plan.update({ where: { id: b.id }, data: { isFeatured: true } })).rejects.toThrow(/plan_one_featured_per_product|Unique constraint/);
  });

  it("two saves racing to feature different plans leave exactly one featured, and the loser gets a clear message", async () => {
    const a = await createPlan(input("sitetest-feat-a"), null);
    const b = await createPlan(input("sitetest-feat-b"), null);
    const results = await Promise.allSettled([updatePlan(a.id, input("sitetest-feat-a", { isFeatured: true }), null), updatePlan(b.id, input("sitetest-feat-b", { isFeatured: true }), null)]);
    expect(await prisma.plan.count({ where: { productKey: "catering", isFeatured: true } })).toBe(1);
    for (const r of results) {
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(PlanError);
        expect((r.reason as Error).message).toMatch(/Another plan was just made the featured plan/);
      }
    }
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  });

  it("refuses to feature the trial, a plan with no monthly price, or a retired plan", async () => {
    await expect(createPlan(input("sitetest-feat-t", { isTrial: true, trialDurationDays: 7, priceMonthly: null, priceAnnual: null, isFeatured: true }), null)).rejects.toThrow(/Only an active plan with a monthly price/);
    await expect(createPlan(input("sitetest-feat-t", { priceMonthly: null, priceAnnual: null, isFeatured: true }), null)).rejects.toThrow(/Only an active plan with a monthly price/);
    const a = await createPlan(input("sitetest-feat-a"), null);
    await setPlanActive(a.id, false, null);
    await expect(updatePlan(a.id, input("sitetest-feat-a", { isFeatured: true }), null)).rejects.toThrow(/Only an active plan with a monthly price/);
    expect(await featuredOf("sitetest-feat-a")).toBe(false);
  });

  it("retiring, turning into a trial, or removing the monthly price clears a featured plan", async () => {
    const a = await createPlan(input("sitetest-feat-a", { isFeatured: true }), null);
    await setPlanActive(a.id, false, null);
    expect(await featuredOf("sitetest-feat-a")).toBe(false);
    await setPlanActive(a.id, true, null);
    expect(await featuredOf("sitetest-feat-a")).toBe(false); // reactivating does not bring the badge back
    await updatePlan(a.id, input("sitetest-feat-a", { isFeatured: true }), null);
    await updatePlan(a.id, input("sitetest-feat-a", { isTrial: true, trialDurationDays: 7, priceMonthly: null, priceAnnual: null }), null);
    expect(await featuredOf("sitetest-feat-a")).toBe(false);
    await updatePlan(a.id, input("sitetest-feat-a", { isFeatured: true }), null);
    await updatePlan(a.id, input("sitetest-feat-a", { priceMonthly: null, priceAnnual: null }), null);
    expect(await featuredOf("sitetest-feat-a")).toBe(false);
  });

  it("the public bundle carries featured, and never marks the trial", async () => {
    await createPlan(input("sitetest-feat-a", { isFeatured: true }), null);
    await createPlan(input("sitetest-feat-b"), null);
    const trial = await createPlan(input("sitetest-feat-t", { isTrial: true, trialDurationDays: 7, priceMonthly: null, priceAnnual: null }), null);
    const flags = Object.fromEntries((await buildBundle()).plans.filter((p) => p.code.startsWith("sitetest-feat")).map((p) => [p.code, p.featured]));
    expect(flags).toEqual({ "sitetest-feat-a": true, "sitetest-feat-b": false, "sitetest-feat-t": false });
    // Even a trial row carrying the flag directly in the database (after the real one is cleared, so the index allows it) is sent as unfeatured.
    await prisma.plan.updateMany({ where: { productKey: "catering", code: "sitetest-feat-a" }, data: { isFeatured: false } });
    await prisma.plan.update({ where: { id: trial.id }, data: { isFeatured: true } });
    expect((await buildBundle()).plans.find((p) => p.code === "sitetest-feat-t")?.featured).toBe(false);
  });

  it("selecting or clearing the featured plan marks the website unpublished; saving the same flag does not", async () => {
    const a = await createPlan(input("sitetest-feat-a"), null);
    await resetMarker();
    await updatePlan(a.id, input("sitetest-feat-a", { isFeatured: true }), null);
    expect(await marker()).toBeDefined();
    await resetMarker();
    await updatePlan(a.id, input("sitetest-feat-a", { isFeatured: true }), null);
    expect(await marker()).toBeUndefined();
    await updatePlan(a.id, input("sitetest-feat-a", { isFeatured: false }), null);
    expect(await marker()).toBeDefined();
  });
});
