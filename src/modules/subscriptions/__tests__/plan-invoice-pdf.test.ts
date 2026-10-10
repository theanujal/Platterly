import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { renderPlanInvoicePdf, PRODUCT_NAME, type PlanInvoiceData } from "../plan-invoice-pdf";

const logo = new Uint8Array(readFileSync(path.join(process.cwd(), "public", "platterly-logo.png")));

const base: PlanInvoiceData = {
  logo,
  invoiceNumber: "FPAC-26-10-1",
  date: "4 Oct 2026",
  productName: PRODUCT_NAME,
  statusLabel: "PAID",
  seller: { name: "Platterly Technologies Pvt Ltd", lines: ["12, MG Road", "Bengaluru 560001"], gstin: "29ABCDE1234F1Z5", pan: "ABCDE1234F", sac: "998314", email: "billing@platterly.in", phone: "+91 98000 00000" },
  billedTo: { name: "Demo Kitchen", lines: ["Bangalore", "Karnataka"], gstin: null },
  planName: "Premium Plan",
  planStatus: "Active",
  subscriptionRef: "ABCD1234",
  term: "1 Month",
  period: "4 Oct 2026 - 3 Nov 2026",
  paymentMethod: "Razorpay",
  transactionId: "pay_123",
  features: ["Unlimited orders", "Unlimited events"],
  amount: "Rs. 3,000.00",
  taxLines: [{ label: "CGST 9%", amount: "Rs. 270.00" }, { label: "SGST 9%", amount: "Rs. 270.00" }],
  total: "Rs. 3,540.00",
  totalLabel: "Total Paid",
  paymentNote: "Payment received through Razorpay.",
  footerNote: null,
};

const pdfText = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("latin1");
const pageCount = (bytes: ArrayBuffer) => (pdfText(bytes).match(/\/Type\s*\/Page\b/g) ?? []).length;

describe("plan invoice PDF", () => {
  it("renders a one-page PDF for a normal paid invoice", () => {
    const bytes = renderPlanInvoicePdf(base);
    expect(pdfText(bytes).startsWith("%PDF")).toBe(true);
    expect(pageCount(bytes)).toBe(1);
  });

  it("renders a trial invoice with no seller block, no features and no tax lines", () => {
    const bytes = renderPlanInvoicePdf({ ...base, seller: null, features: [], taxLines: [], statusLabel: "TRIAL", amount: "Rs. 0", total: "Rs. 0", totalLabel: "Total Due" });
    expect(pdfText(bytes).startsWith("%PDF")).toBe(true);
    expect(pageCount(bytes)).toBe(1);
  });

  it("keeps a plan with many features and long names on one or two pages without throwing", () => {
    const features = Array.from({ length: 16 }, (_, i) => `Unlimited feature number ${i + 1} with a long name`);
    const bytes = renderPlanInvoicePdf({ ...base, features, billedTo: { name: "A Very Long Kitchen Name Private Limited Of Bengaluru", lines: ["Line one of a long address", "Line two", "Line three", "Line four"], gstin: "29ABCDE1234F1Z5" }, footerNote: "Reverse charge: No. ".repeat(8) });
    expect(pageCount(bytes)).toBeLessThanOrEqual(2);
  });
});
