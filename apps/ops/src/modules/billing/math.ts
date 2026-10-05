/**
 * The arithmetic of a plan payment, kept free of the database so checkout, the webhook and the tests all use the same
 * numbers (ported unchanged from catering's Chunk 20). Plan prices are BEFORE GST; GST is added on top.
 */
export type Interval = "MONTHLY" | "ANNUAL";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A monthly plan buys 30 days, an annual plan 365. */
export const INTERVAL_DAYS: Record<Interval, number> = { MONTHLY: 30, ANNUAL: 365 };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export interface PriceBreakdown {
  amount: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
}

export function priceBreakdown(price: number, gstPercent: number): PriceBreakdown {
  const amount = round2(price);
  const gstAmount = round2((amount * gstPercent) / 100);
  return { amount, gstPercent, gstAmount, total: round2(amount + gstAmount) };
}

export function periodEndFrom(start: Date, interval: Interval): Date {
  return new Date(start.getTime() + INTERVAL_DAYS[interval] * DAY_MS);
}

/** How the GST on an invoice is shown: same state as Platterly pays CGST + SGST (half each), another state pays IGST. */
export type GstKind = "INTRA" | "INTER" | "UNKNOWN";

const norm = (value?: string | null) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function gstStateCode(gstin?: string | null): string | null {
  const code = (gstin ?? "").trim().slice(0, 2);
  return /^\d{2}$/.test(code) ? code : null;
}

/** The buyer's state comes from the first two digits of its GSTIN when it has one, otherwise from its state name. Unknown on either side: one plain "GST" line, never a guess. */
export function gstKind(seller: { stateCode?: string | null; state?: string | null }, buyer: { gstin?: string | null; state?: string | null }): GstKind {
  const sellerCode = seller.stateCode?.trim() || null;
  const buyerCode = gstStateCode(buyer.gstin);
  if (sellerCode && buyerCode) return sellerCode === buyerCode ? "INTRA" : "INTER";
  if (norm(seller.state) && norm(buyer.state)) return norm(seller.state) === norm(buyer.state) ? "INTRA" : "INTER";
  return "UNKNOWN";
}

export interface GstLine {
  label: string;
  amount: number;
}

export function gstLines(kind: GstKind, gstPercent: number, gstAmount: number): GstLine[] {
  if (kind === "INTRA") {
    const half = Math.round((gstAmount / 2) * 100) / 100;
    return [
      { label: `CGST (${gstPercent / 2}%)`, amount: half },
      { label: `SGST (${gstPercent / 2}%)`, amount: Math.round((gstAmount - half) * 100) / 100 },
    ];
  }
  return [{ label: kind === "INTER" ? `IGST (${gstPercent}%)` : `GST (${gstPercent}%)`, amount: gstAmount }];
}

/**
 * Plan invoice numbers: `<prefix><business initials>-<yy>-<mm>-<n>`, for example FPAC-26-10-1 for the first invoice of "ABC Caterer".
 * The month is the Indian calendar month. `n` is one running number across all businesses.
 */
export function invoiceInitials(name: string): string {
  const letters = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join("");
  return letters.slice(0, 4) || "X";
}

export function formatInvoiceNumber(prefix: string, business: string, paidAt: Date, n: number): string {
  const ist = new Date(paidAt.getTime() + 5.5 * 60 * 60 * 1000);
  const yy = String(ist.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  return `${prefix}${invoiceInitials(business)}-${yy}-${mm}-${n}`;
}

/** What an invoice is printed from, fixed on the day the payment was confirmed. */
export interface InvoiceSnapshot {
  seller: {
    legalName: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    stateCode: string | null;
    postalCode: string | null;
    country: string | null;
    gstin: string | null;
    pan: string | null;
    sacCode: string;
    email: string | null;
    phone: string | null;
    website: string | null;
    note: string | null;
  };
  buyer: { name: string; addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null; gstin: string | null };
  gst: { kind: GstKind; lines: GstLine[] };
  highlights: string[];
}
