import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderPlanInvoicePdf } from "@platterly/contract/plan-invoice-pdf";
import { prisma } from "@/lib/db";
import type { InvoiceSnapshot } from "./math";

// IST, so the invoice date matches the month in its number.
const formatDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const inr = (n: unknown) => `Rs. ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const addressOf = (p: { addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null }) =>
  [p.addressLine1, p.addressLine2, [p.city, p.postalCode].filter(Boolean).join(" "), p.state, p.country].filter(Boolean) as string[];

/**
 * The PDF of one paid plan invoice, the same layout the business downloads in its product, from the frozen snapshot. Used by the staff download and by the
 * Platform's Invoices page. `scope` limits the lookup to one business and product, so a payment id from another business is simply not found.
 */
export async function renderPaymentInvoice(id: string, scope?: { businessId: string; productKey: string }): Promise<{ bytes: ArrayBuffer; fileName: string } | null> {
  const payment = await prisma.subscriptionPayment.findFirst({ where: { id, status: "PAID", ...(scope ?? {}) }, include: { plan: { select: { name: true } }, product: { select: { name: true } } } });
  if (!payment?.invoiceSnapshot || !payment.invoiceNumber || !payment.paidAt) return null;
  const { seller, buyer, gst, highlights, credit } = payment.invoiceSnapshot as unknown as InvoiceSnapshot;

  const logo = await readFile(path.join(process.cwd(), "public", "platterly-logo.png"));
  const bytes = renderPlanInvoicePdf({
    logo: new Uint8Array(logo),
    invoiceNumber: payment.invoiceNumber,
    date: formatDate(payment.paidAt),
    productName: payment.product.name,
    statusLabel: "PAID",
    seller: { name: seller.legalName ?? "Platterly", lines: addressOf(seller), gstin: seller.gstin, pan: seller.pan, sac: seller.sacCode, email: seller.email, phone: seller.phone },
    billedTo: { name: buyer.name, lines: addressOf(buyer), gstin: buyer.gstin },
    planName: payment.plan.name,
    planStatus: "Active",
    subscriptionRef: id.slice(-8).toUpperCase(),
    term: payment.interval === "ANNUAL" ? "1 year (365 days)" : "30 days",
    period: `${payment.periodStart ? formatDate(payment.periodStart) : ""} - ${payment.periodEnd ? formatDate(payment.periodEnd) : ""}`,
    paymentMethod: "Razorpay",
    transactionId: payment.razorpayPaymentId ?? "-",
    features: highlights,
    amount: inr(credit ? credit.planPrice : payment.amount),
    ...(credit ? { creditLine: { label: credit.label, amount: `-${inr(credit.amount)}` } } : {}),
    taxLines: gst.lines.map((line) => ({ label: line.label, amount: inr(line.amount) })),
    total: inr(payment.total),
    totalLabel: "Total Paid",
    paymentNote: "Payment received through Razorpay. Your plan is active and all its features are available.",
    footerNote: seller.note,
  });
  return { bytes, fileName: `${payment.invoiceNumber}.pdf` };
}
