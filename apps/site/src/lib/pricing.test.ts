import { describe, expect, it } from "vitest";
import { PRICING } from "@/content/catering";
import { type OpsPlan, pricingFromPlans } from "./pricing";

const plan = (over: Partial<OpsPlan>): OpsPlan => ({ code: "p", name: "Plan", description: "Desc", isTrial: false, trialDurationDays: null, priceMonthly: 1000, priceAnnual: null, gstPercent: 18, highlights: ["One", "Two"], ...over });
const trial = plan({ code: "trial", name: "Trial", isTrial: true, trialDurationDays: 14, priceMonthly: null });

describe("pricingFromPlans", () => {
  it("falls back to the typed-in cards when Ops sends no plans", () => {
    expect(pricingFromPlans(undefined)).toBe(PRICING);
    expect(pricingFromPlans([])).toBe(PRICING);
  });

  it("keeps a plan without a monthly price off the site", () => {
    const data = pricingFromPlans([trial, plan({ name: "Hidden", priceMonthly: null }), plan({ name: "Real" })]);
    expect(data.plans.map((p) => p.name)).toEqual(["Free Trial", "Real"]);
  });

  it("shows a new paid plan with its price, yearly saving, highlights and the GST note", () => {
    const data = pricingFromPlans([trial, plan({ name: "Cross Platform", priceMonthly: 4999, priceAnnual: 39999, description: "all the upcoming features", highlights: ["everything upcoming"] })]);
    expect(data.note).toContain("GST (18%)");
    expect(data.plans[0]).toMatchObject({ name: "Free Trial", price: "₹0", per: "for 14 days", cta: "Start Free", featured: false });
    expect(data.plans[1]).toMatchObject({ name: "Cross Platform", price: "₹4,999", per: "per month + GST", blurb: "all the upcoming features", features: ["everything upcoming"], cta: "Get Started", featured: true });
    expect(data.plans[1].yearly).toBe("or ₹39,999 a year + GST, which saves ₹19,989");
  });

  it("features no card when an older Ops (no featured field) sends several paid plans, and the sole paid plan when it sends one", () => {
    expect(pricingFromPlans([plan({ name: "A" }), plan({ name: "B", priceMonthly: 2000 })]).plans.some((p) => p.featured)).toBe(false);
    expect(pricingFromPlans([trial, plan({ name: "Only" })]).plans.map((p) => p.featured)).toEqual([false, true]);
  });

  it("respects the featured plan Ops marks, among several paid plans", () => {
    const data = pricingFromPlans([trial, plan({ name: "A", featured: false }), plan({ name: "B", priceMonthly: 2000, featured: true }), plan({ name: "C", priceMonthly: 3000, featured: false })]);
    expect(data.plans.map((p) => [p.name, p.featured])).toEqual([["Free Trial", false], ["A", false], ["B", true], ["C", false]]);
  });

  it("features nothing when the field is present and no plan is marked, even for a sole paid plan", () => {
    expect(pricingFromPlans([trial, plan({ name: "Only", featured: false })]).plans.some((p) => p.featured)).toBe(false);
  });

  it("never features the trial, whatever the bundle says", () => {
    const data = pricingFromPlans([{ ...trial, featured: true }, plan({ name: "A", featured: false })]);
    expect(data.plans[0].featured).toBe(false);
  });
});
