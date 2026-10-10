import { getGuestCount } from "@/modules/orders/order-card";
import { invoiceDisplayStatus } from "./invoice-status";

/**
 * Everything the invoice or receipt shows, worked out once and shared by the invoice page, the customer's link and the PDF,
 * so the three can never disagree (AJ, 2026-10-10: laid out like the sample bill). Pure: no database, no formatting.
 */

type InvoiceStatusValue = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";

export interface DocumentSource {
  type: "INVOICE" | "RECEIPT";
  number: string;
  status: InvoiceStatusValue;
  issueDate: Date;
  dueDate: Date | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  businessName: string;
  businessAddress: string | null;
  businessGstNumber: string | null;
  gstEnabled: boolean;
  gstType: "CGST_SGST" | "IGST";
  gstRate: unknown;
  taxableValue: unknown;
  cgst: unknown;
  sgst: unknown;
  igst: unknown;
  total: unknown;
  terms: string | null;
  notes: string | null;
  items: { id?: string; description: string; detail: string | null; hsnSac: string | null; quantity: unknown; rate: unknown; amount: unknown }[];
  order: {
    orderNumber: string | null;
    total: unknown;
    discount: unknown;
    eventStartDate: Date;
    eventEndDate: Date;
    venue: string | null;
    totalParticipants: number | null;
    adultCount: number | null;
    childBelow5Count: number | null;
    child5To10Count: number | null;
    eventType: { name: string } | null;
    mealPlanEntries: { menu: { name: string } | null; items: { name: string; itemType: string; isExtra: boolean; menuItem: { categories: { category: { name: string } }[] } | null }[] }[];
  };
}

export type StatusTone = "info" | "success" | "warning" | "danger" | "neutral";

export interface InvoiceDocument {
  type: "INVOICE" | "RECEIPT";
  title: "INVOICE" | "RECEIPT";
  number: string;
  issueDate: Date;
  dueDate: Date | null;
  business: { name: string; address: string | null; gstNumber: string | null };
  orderNumber: string | null;
  status: { label: string; tone: StatusTone };
  customer: { name: string; phone: string | null; address: string | null };
  event: { type: string | null; start: Date; end: Date; guests: number | null; venue: string | null };
  menu: { name: string | null; groups: { name: string; items: string[] }[] } | null;
  charges: { id: string; description: string; detail: string | null; hsnSac: string | null; quantity: number; rate: number; amount: number }[];
  gst: { enabled: boolean; type: "CGST_SGST" | "IGST"; rate: number; taxableValue: number; cgst: number; sgst: number; igst: number };
  summary: { label: string; value: number; kind?: "discount" | "balance" }[];
  total: number;
  notes: string | null;
  terms: string | null;
}

const num = (v: unknown) => Number(v);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  DRAFT: { label: "UNPAID", tone: "info" },
  SENT: { label: "UNPAID", tone: "info" },
  PARTIALLY_PAID: { label: "PARTIALLY PAID", tone: "warning" },
  PAID: { label: "PAID", tone: "success" },
  OVERDUE: { label: "OVERDUE", tone: "danger" },
  CANCELLED: { label: "CANCELLED", tone: "neutral" },
};

/** Dishes grouped under the category they belong to, then the add-ons: what the customer is getting. Each dish is listed once. */
export function menuForDocument(entries: DocumentSource["order"]["mealPlanEntries"]): InvoiceDocument["menu"] {
  const names = [...new Set(entries.map((e) => e.menu?.name).filter((n): n is string => Boolean(n)))];
  const groups = new Map<string, Set<string>>();
  const add = (group: string, label: string) => (groups.get(group) ?? groups.set(group, new Set()).get(group)!).add(label);
  for (const entry of entries) {
    for (const item of entry.items) {
      if (item.itemType === "ADD_ON") add("Add-ons & Live Counters", item.name);
      else add(item.menuItem?.categories[0]?.category.name ?? "Other", item.isExtra ? `${item.name} (Extra)` : item.name);
    }
  }
  if (names.length === 0 && groups.size === 0) return null;
  return { name: names.length > 0 ? names.join(" + ") : null, groups: [...groups.entries()].map(([name, items]) => ({ name, items: [...items] })) };
}

export function buildInvoiceDocument(source: DocumentSource, paid: number, now: Date = new Date()): InvoiceDocument {
  const isReceipt = source.type === "RECEIPT";
  const total = num(source.total);
  const status = isReceipt ? STATUS.PAID : (STATUS[invoiceDisplayStatus(source.status, source.dueDate, now)] ?? STATUS.DRAFT);
  const orderTotal = num(source.order.total);
  const discount = num(source.order.discount);

  // An invoice sums up its own total against what has been paid; a receipt shows the payment it acknowledges against the order.
  const summary: InvoiceDocument["summary"] = isReceipt
    ? [
        { label: "Order Total", value: orderTotal },
        { label: "Received (this receipt)", value: total },
        { label: "Total Paid So Far", value: paid },
        { label: "Balance Due", value: Math.max(round2(orderTotal - paid), 0), kind: "balance" },
      ]
    : [
        { label: "Original Amount", value: round2(total + discount) },
        ...(discount > 0 ? [{ label: "Discount", value: discount, kind: "discount" as const }] : []),
        { label: "Total After Discount", value: total },
        { label: "Amount Paid", value: paid },
        { label: "Balance Due", value: Math.max(round2(total - paid), 0), kind: "balance" },
      ];

  return {
    type: source.type,
    title: isReceipt ? "RECEIPT" : "INVOICE",
    number: source.number,
    issueDate: source.issueDate,
    dueDate: isReceipt ? null : source.dueDate,
    business: { name: source.businessName, address: source.businessAddress, gstNumber: source.businessGstNumber },
    orderNumber: source.order.orderNumber,
    status,
    customer: { name: source.customerName, phone: source.customerPhone, address: source.customerAddress },
    event: { type: source.order.eventType?.name ?? null, start: source.order.eventStartDate, end: source.order.eventEndDate, guests: getGuestCount(source.order), venue: source.order.venue },
    menu: menuForDocument(source.order.mealPlanEntries),
    charges: source.items.map((i, index) => ({ id: i.id ?? String(index), description: i.description, detail: i.detail, hsnSac: i.hsnSac, quantity: num(i.quantity), rate: num(i.rate), amount: num(i.amount) })),
    gst: { enabled: source.gstEnabled, type: source.gstType, rate: num(source.gstRate), taxableValue: num(source.taxableValue), cgst: num(source.cgst), sgst: num(source.sgst), igst: num(source.igst) },
    summary,
    total,
    notes: source.notes,
    terms: source.terms,
  };
}
