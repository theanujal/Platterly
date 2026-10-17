import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createPlan, setPlanActive, updatePlan, type PlanInput } from "../plans";

/**
 * The Unpublished changes badge: a catering plan the website shows (active, and the trial or priced) marks the site content
 * "changed" when a field the site shows changes; limits (entitlements), no-op saves and plans the site does not show never do.
 * The tests share the dev database, so the real marker is put back afterwards and every row made here is removed.
 */
const CODES = ["sitetest-mark-a", "sitetest-mark-b", "sitetest-mark-c"];
const base: PlanInput = { productKey: "catering", code: "sitetest-mark-a", name: "Mark Plan", description: "Desc", isTrial: false, priceMonthly: 500, priceAnnual: 5000, gstPercent: 18, highlights: ["One"], entitlements: {} };

let saved: Awaited<ReturnType<typeof prisma.siteSetting.findUnique>>;
const marker = async () => (await prisma.siteSetting.findUnique({ where: { key: "changed" } }))?.value as { at: string } | undefined;
const reset = () => prisma.siteSetting.deleteMany({ where: { key: "changed" } });
const wait = () => new Promise((r) => setTimeout(r, 5));

async function removePlans() {
  const rows = await prisma.plan.findMany({ where: { code: { in: CODES } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { subject: { in: rows.map((r) => r.id) } } });
  await prisma.plan.deleteMany({ where: { code: { in: CODES } } });
}

beforeAll(async () => {
  saved = await prisma.siteSetting.findUnique({ where: { key: "changed" } });
  await removePlans();
});
afterEach(async () => {
  await removePlans();
  await reset();
});
afterAll(async () => {
  await removePlans();
  if (saved) await prisma.siteSetting.upsert({ where: { key: "changed" }, create: { key: "changed", value: saved.value as object }, update: { value: saved.value as object } });
  else await reset();
});

describe("plan edits and the Unpublished changes marker", () => {
  it("creating a plan the site shows marks the content changed", async () => {
    await reset();
    await createPlan(base, null);
    expect(await marker()).toBeDefined();
  });

  it("creating a plan the site does not show (no monthly price) does not", async () => {
    await reset();
    await createPlan({ ...base, priceMonthly: null, priceAnnual: null }, null);
    expect(await marker()).toBeUndefined();
  });

  it.each([
    ["name", { name: "Renamed" }],
    ["description", { description: "New text" }],
    ["monthly price", { priceMonthly: 600 }],
    ["yearly price", { priceAnnual: 5500 }],
    ["GST", { gstPercent: 12 }],
    ["highlights", { highlights: ["One", "Two"] }],
  ])("changing the %s marks the content changed", async (_label, change) => {
    const plan = await createPlan(base, null);
    await reset();
    await updatePlan(plan.id, { ...base, ...change }, null);
    expect(await marker()).toBeDefined();
  });

  it("changing the trial days marks the content changed", async () => {
    const trial = await createPlan({ ...base, code: "sitetest-mark-b", isTrial: true, trialDurationDays: 7, priceMonthly: null, priceAnnual: null }, null);
    await reset();
    await updatePlan(trial.id, { ...base, code: "sitetest-mark-b", isTrial: true, trialDurationDays: 14, priceMonthly: null, priceAnnual: null }, null);
    expect(await marker()).toBeDefined();
  });

  it("an entitlements-only edit does not mark the content changed", async () => {
    const plan = await createPlan(base, null);
    await reset();
    const manifest = (await prisma.product.findUniqueOrThrow({ where: { key: "catering" } })).manifest as { entitlements: { key: string; type: string }[] };
    const key = manifest.entitlements.find((spec) => spec.type === "limit")?.key;
    expect(key, "the catering manifest declares a numeric limit").toBeDefined();
    await updatePlan(plan.id, { ...base, entitlements: { [key as string]: 25 } }, null);
    expect(await marker()).toBeUndefined();
  });

  it("saving a plan with nothing changed does not touch the marker", async () => {
    const plan = await createPlan(base, null);
    await reset();
    await wait();
    await updatePlan(plan.id, base, null);
    expect(await marker()).toBeUndefined();
  });

  it("deactivating and reactivating a shown plan marks the content changed each time; repeating the same state does not", async () => {
    const plan = await createPlan(base, null);
    await reset();
    await setPlanActive(plan.id, false, null);
    const retired = await marker();
    expect(retired).toBeDefined();
    await reset();
    await setPlanActive(plan.id, false, null);
    expect(await marker()).toBeUndefined();
    await setPlanActive(plan.id, true, null);
    expect(await marker()).toBeDefined();
  });

  it("editing a plan the site does not show (inactive, no price) does not mark the content changed", async () => {
    const hidden = await createPlan({ ...base, code: "sitetest-mark-c", priceMonthly: null, priceAnnual: null }, null);
    await reset();
    await updatePlan(hidden.id, { ...base, code: "sitetest-mark-c", name: "Still hidden", priceMonthly: null, priceAnnual: null }, null);
    expect(await marker()).toBeUndefined();
  });

  it("a plan of another product never marks the website", async () => {
    const other = await prisma.product.findFirst({ where: { key: { not: "catering" } } });
    if (!other?.manifest) return; // only catering is registered here: nothing to check
    await reset();
    await createPlan({ ...base, productKey: other.key, code: "sitetest-mark-c", entitlements: {} }, null).catch(() => undefined);
    expect(await marker()).toBeUndefined();
  });
});
