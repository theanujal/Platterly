/**
 * How the GST on a plan invoice is shown. A caterer in the same state as Platterly pays CGST + SGST (half each);
 * one in another state pays IGST. The caterer's state comes from the first two digits of its GSTIN when it has one,
 * otherwise from its state name. If either side is unknown the invoice shows one plain "GST" line rather than guessing.
 */
export type GstKind = "INTRA" | "INTER" | "UNKNOWN";

const norm = (value?: string | null) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function gstStateCode(gstin?: string | null): string | null {
  const code = (gstin ?? "").trim().slice(0, 2);
  return /^\d{2}$/.test(code) ? code : null;
}

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
