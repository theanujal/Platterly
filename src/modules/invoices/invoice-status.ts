// Client-safe: the one place that decides what an invoice's status badge says.
export type InvoiceStatusValue = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
export type InvoiceDisplayStatus = InvoiceStatusValue | "OVERDUE";

/** What the stored status should be, from the confirmed payments against the invoice total. */
export function computeInvoiceStatus(input: { total: number; paid: number; sentAt: Date | null; cancelled: boolean }): InvoiceStatusValue {
  if (input.cancelled) return "CANCELLED";
  if (input.total > 0 && input.paid + 0.005 >= input.total) return "PAID";
  if (input.paid > 0) return "PARTIALLY_PAID";
  return input.sentAt ? "SENT" : "DRAFT";
}

/** Overdue is not stored: it is "the due date passed and something is still owed". */
export function invoiceDisplayStatus(status: InvoiceStatusValue, dueDate: Date | null, now: Date = new Date()): InvoiceDisplayStatus {
  if (status === "PAID" || status === "CANCELLED" || !dueDate) return status;
  const endOfDue = new Date(dueDate);
  endOfDue.setUTCHours(23, 59, 59, 999);
  return endOfDue.getTime() < now.getTime() ? "OVERDUE" : status;
}

export const INVOICE_STATUS_LABEL: Record<InvoiceDisplayStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

export const INVOICE_STATUS_VARIANT: Record<InvoiceDisplayStatus, "neutral" | "info" | "success" | "danger"> = {
  DRAFT: "neutral",
  SENT: "info",
  PARTIALLY_PAID: "info",
  PAID: "success",
  OVERDUE: "danger",
  CANCELLED: "neutral",
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** GST is carved out of an inclusive total, so the invoice total never differs from the order total. */
export function splitInclusiveGst(total: number, ratePercent: number, type: "CGST_SGST" | "IGST") {
  if (ratePercent <= 0) return { taxableValue: round2(total), cgst: 0, sgst: 0, igst: 0 };
  const taxableValue = round2(total / (1 + ratePercent / 100));
  const tax = round2(total - taxableValue);
  if (type === "IGST") return { taxableValue, cgst: 0, sgst: 0, igst: tax };
  const cgst = round2(tax / 2);
  return { taxableValue, cgst, sgst: round2(tax - cgst), igst: 0 };
}
