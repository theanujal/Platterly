import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderPlanInvoicePdf } from "@platterly/contract/plan-invoice-pdf";
import { prisma } from "@/lib/db";
import { getStaff } from "@/lib/session";
import type { InvoiceSnapshot } from "@/modules/billing/math";

export const dynamic = "force-dynamic";

// IST, so the invoice date matches the month in its number.
const formatDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const inr = (n: unknown) => `Rs. ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const addressOf = (p: { addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null }) =>
  [p.addressLine1, p.addressLine2, [p.city, p.postalCode].filter(Boolean).join(" "), p.state, p.country].filter(Boolean) as string[];

/** GET: the PDF of one paid plan invoice, the same layout the business downloads in its product, from the frozen snapshot. Staff only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getStaff())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const payment = await prisma.subscriptionPayment.findFirst({ where: { id, status: "PAID" }, include: { plan: { select: { name: true } }, product: { select: { name: true } } } });
  if (!payment?.invoiceSnapshot || !payment.invoiceNumber || !payment.paidAt) return new Response("Not found", { status: 404 });
  const { seller, buyer, gst, highlights } = payment.invoiceSnapshot as unknown as InvoiceSnapshot;

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
    amount: inr(payment.amount),
    taxLines: gst.lines.map((line) => ({ label: line.label, amount: inr(line.amount) })),
    total: inr(payment.total),
    totalLabel: "Total Paid",
    paymentNote: "Payment received through Razorpay. Your plan is active and all its features are available.",
    footerNote: seller.note,
  });
  return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${payment.invoiceNumber}.pdf"`, "Cache-Control": "private, no-store" } });
}
