/** Pure purchasing maths, shared by the pages and the server. */

export interface PoLine {
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
}

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const orderedValue = (lines: PoLine[]) => money(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0));
export const receivedValue = (lines: PoLine[]) => money(lines.reduce((s, l) => s + l.receivedQuantity * l.unitCost, 0));
export const remainingQuantity = (line: PoLine) => Math.max(0, Math.round((line.quantity - line.receivedQuantity) * 1000) / 1000);

/** Status after a receipt: everything in is RECEIVED, something in is PARTIALLY_RECEIVED. */
export function statusAfterReceipt(lines: PoLine[]): "RECEIVED" | "PARTIALLY_RECEIVED" | "ORDERED" {
  if (lines.every((l) => remainingQuantity(l) === 0)) return "RECEIVED";
  if (lines.some((l) => l.receivedQuantity > 0)) return "PARTIALLY_RECEIVED";
  return "ORDERED";
}

/** What we owe a supplier: the value of what has actually arrived, less what has been paid. Negative means paid ahead. */
export const outstandingBalance = (receivedTotal: number, paidTotal: number) => money(receivedTotal - paidTotal);

export const PO_STATUS_LABEL = {
  DRAFT: "Draft",
  ORDERED: "Ordered",
  PARTIALLY_RECEIVED: "Partly received",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
} as const;

export const PO_STATUS_TONE = {
  DRAFT: "neutral",
  ORDERED: "info",
  PARTIALLY_RECEIVED: "warning",
  RECEIVED: "success",
  CANCELLED: "danger",
} as const;
