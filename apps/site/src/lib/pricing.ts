import { PRICING } from "@/content/catering";

/** A plan as Platterly Ops sends it in the content bundle (prices before GST). */
export interface OpsPlan {
  code: string;
  name: string;
  description: string | null;
  isTrial: boolean;
  trialDurationDays: number | null;
  priceMonthly: number | null;
  priceAnnual: number | null;
  gstPercent: number;
  highlights: string[];
}

export interface PricingCard {
  name: string;
  price: string;
  per: string;
  blurb: string;
  yearly?: string;
  features: readonly string[];
  cta: string;
  featured: boolean;
}
export interface PricingData {
  note: string;
  plans: readonly PricingCard[];
}

const rupees = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

/**
 * The pricing cards from Ops' plans: the active trial, then every active plan with a monthly price, cheapest first. A plan without a
 * monthly price is never shown. With no plans from Ops (not set up, or an older Ops) the typed-in cards in content/catering.ts are used.
 */
export function pricingFromPlans(plans: OpsPlan[] | undefined): PricingData {
  const shown = (plans ?? []).filter((p) => p.isTrial || (p.priceMonthly !== null && p.priceMonthly > 0));
  if (shown.length === 0) return PRICING;
  const paid = shown.filter((p) => !p.isTrial);
  const gst = [...new Set(paid.map((p) => p.gstPercent))];
  return {
    note: gst.length === 1 ? `Prices are in Indian rupees and GST (${gst[0]}%) is added at checkout.` : "Prices are in Indian rupees and GST is added at checkout.",
    plans: shown.map((p) => {
      const yearly =
        p.priceAnnual !== null && p.priceMonthly !== null
          ? `or ${rupees(p.priceAnnual)} a year + GST${p.priceAnnual < p.priceMonthly * 12 ? `, which saves ${rupees(p.priceMonthly * 12 - p.priceAnnual)}` : ""}`
          : undefined;
      return {
        name: p.isTrial ? "Free Trial" : p.name,
        price: p.isTrial ? "₹0" : rupees(p.priceMonthly ?? 0),
        per: p.isTrial ? `for ${p.trialDurationDays ?? 7} days` : "per month + GST",
        blurb: p.description ?? "",
        ...(p.isTrial ? {} : yearly ? { yearly } : {}),
        features: p.highlights,
        cta: p.isTrial ? "Start Free" : "Get Started",
        featured: paid.length === 1 && !p.isTrial,
      };
    }),
  };
}
