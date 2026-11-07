import type { GstKind, GstLine } from "./gst-split";

type Party = { addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null; gstin: string | null };

/** What a plan invoice is printed from: fixed on the day the payment was confirmed, so it never changes later. */
export interface InvoiceSnapshot {
  seller: Party & { legalName: string | null; stateCode: string | null; pan: string | null; sacCode: string; email: string | null; phone: string | null; website: string | null; note: string | null };
  buyer: Party & { name: string };
  gst: { kind: GstKind; lines: GstLine[] };
  highlights: string[];
  /** Present on an invoice for an upgrade that was credited: the full plan price, the credit and its label (all before GST). `amount` on the payment is the price less the credit. */
  credit?: { planPrice: number; amount: number; label: string };
}
