import type { PlanOffer, PriceView } from "@platterly/contract";
import type { Interval } from "./format";

/**
 * Sample data for the Store prototype (docs/store-first-slice-design.md, section 9). Invented products, plans and figures,
 * typed with the contract's `PlanOffer`/`PriceView`, so the later swap to the real Ops calls changes the data source and
 * not the pages. Nothing here is a real price. GST is 18% on every sample amount.
 */
const price = (amount: number): PriceView => {
  const gstAmount = Math.round(amount * 18) / 100;
  return { amount, gstPercent: 18, gstAmount, total: Math.round((amount + gstAmount) * 100) / 100 };
};

const plan = (id: string, name: string, description: string, highlights: string[], monthly: number, annual: number | null): PlanOffer => ({
  id,
  code: id.toUpperCase(),
  name,
  description,
  highlights,
  monthly: price(monthly),
  annual: annual === null ? null : price(annual),
});

export type ProductStatus = "SUBSCRIBED" | "TRIAL" | "NONE";

export interface SampleProduct {
  key: string;
  name: string;
  tagline: string;
  status: ProductStatus;
  plans: PlanOffer[];
  /** Present when SUBSCRIBED. `nextRenewal` is an ISO date, or empty when Ops holds no period end (a hand-assigned plan). */
  subscription?: { planId: string; interval: Interval; nextRenewal: string; /** The plan's name from Ops, used when the plan is not on sale (a hand-assigned or retired plan). */ planName?: string };
  /** Present when TRIAL. ISO date. */
  trialEndsAt?: string;
}

export const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    key: "caterly",
    name: "Caterly",
    tagline: "Run your catering business, from enquiry to payment.",
    status: "SUBSCRIBED",
    subscription: { planId: "caterly-growth", interval: "ANNUAL", nextRenewal: "2027-04-18" },
    plans: [
      plan("caterly-starter", "Starter", "For a kitchen taking its first orders.", ["Up to 3 team members", "50 events a month", "Quotations and invoices"], 1000, null),
      plan("caterly-growth", "Growth", "For a busy kitchen with a growing team.", ["Up to 10 team members", "200 events a month", "Menu approvals and kitchen planning"], 2500, 25000),
      plan("caterly-pro", "Pro", "For several kitchens run as one business.", ["Unlimited team members", "Unlimited events", "Inventory, purchasing and reports"], 5000, 50000),
    ],
  },
  {
    key: "rivo",
    name: "Rivo",
    tagline: "Keep customers coming back.",
    status: "SUBSCRIBED",
    subscription: { planId: "rivo-plus", interval: "MONTHLY", nextRenewal: "2026-12-06" },
    plans: [
      plan("rivo-basic", "Basic", "Core customer tools.", ["1 location", "500 contacts"], 800, 8000),
      plan("rivo-plus", "Plus", "More reach for a growing customer base.", ["3 locations", "5,000 contacts", "Campaigns"], 1800, 18000),
    ],
  },
  {
    key: "stockroom",
    name: "Stockroom",
    tagline: "Know what is on your shelves.",
    status: "TRIAL",
    trialEndsAt: "2026-11-15",
    plans: [
      plan("stockroom-lite", "Lite", "Track stock in one store.", ["1 store", "500 items"], 600, 6000),
      plan("stockroom-full", "Full", "Several stores and purchasing.", ["5 stores", "Unlimited items", "Purchase orders"], 1500, 15000),
    ],
  },
  {
    key: "tabletop",
    name: "Tabletop",
    tagline: "Bookings and seating for your venue.",
    status: "NONE",
    plans: [
      plan("tabletop-standard", "Standard", "Bookings for one venue.", ["1 venue", "Online bookings"], 900, 9000),
      plan("tabletop-plus", "Plus", "Several venues and guest records.", ["5 venues", "Guest records", "Reminders"], 2200, 22000),
    ],
  },
];

export interface SampleBundle {
  key: string;
  name: string;
  productKeys: string[];
  monthly: PriceView;
  annual: PriceView;
  /** What the same plans cost bought one by one (totals, GST included), so the saving is worked out, not typed. */
  separateMonthlyTotal: number;
  separateAnnualTotal: number;
}

export const SAMPLE_BUNDLES: SampleBundle[] = [
  {
    key: "caterly-rivo",
    name: "Caterly Growth + Rivo Basic",
    productKeys: ["caterly", "rivo"],
    monthly: price(2800),
    annual: price(30000),
    separateMonthlyTotal: price(2500).total + price(800).total,
    separateAnnualTotal: price(25000).total + price(8000).total,
  },
];

export const findProduct = (key: string | undefined) => SAMPLE_PRODUCTS.find((product) => product.key === key) ?? null;

export type ChangeKind = "current" | "upgrade" | "downgrade" | "new";

/** Current, upgrade or downgrade, by comparing the monthly price with the plan the business is on. A product with no subscription is a new purchase. */
export function changeKind(product: SampleProduct, target: PlanOffer): ChangeKind {
  const sub = product.subscription;
  if (!sub) return "new";
  if (sub.planId === target.id) return "current";
  const current = product.plans.find((p) => p.id === sub.planId);
  return current && target.monthly.amount < current.monthly.amount ? "downgrade" : "upgrade";
}
