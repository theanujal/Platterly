import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getPaymentInvoice } from "@/modules/subscriptions/billing-source";
import { renderPlanInvoicePdf, PRODUCT_NAME } from "@/modules/subscriptions/plan-invoice-pdf";

// IST, so the invoice date matches the month in its number.
const formatDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
// The standard PDF font has no rupee glyph, so INR is written "Rs.".
const money = (amount: number) => `Rs. ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const addressOf = (p: { addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null }) =>
  [p.addressLine1, p.addressLine2, [p.city, p.postalCode].filter(Boolean).join(" "), p.state, p.country].filter(Boolean) as string[];

/**
 * The GST tax invoice for one paid plan payment (Chunk 20), in the layout of AJ's 2026-10-10 sample (logo and tagline, status pill, Billed by / Billed to / Plan cards,
 * details, features, summary, "Powered by Platterly"), with the GST split. Printed from the snapshot taken when the payment was confirmed, so a later change to Platterly's
 * or the caterer's details never rewrites an old invoice. Only that caterer can download it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization({ allowLocked: true });
  await requirePermission({ settings: ["view"] }, organizationId);

  // Catering's own rows by default; Platterly Ops's frozen invoice when OPS_BILLING is on. Same layout either way.
  const invoice = await getPaymentInvoice(organizationId, id);
  if (!invoice) return new Response("Not found", { status: 404 });
  const payment = { ...invoice, subscriptionPlan: { name: invoice.planName } };
  const snapshot = invoice.snapshot;
  const { seller, buyer, gst } = snapshot;

  const logo = await readFile(path.join(process.cwd(), "public", "platterly-logo.png"));
  const bytes = renderPlanInvoicePdf({
    logo: new Uint8Array(logo),
    invoiceNumber: payment.invoiceNumber,
    date: formatDate(payment.paidAt),
    productName: PRODUCT_NAME,
    statusLabel: "PAID",
    seller: { name: seller.legalName ?? "Platterly", lines: addressOf(seller), gstin: seller.gstin, pan: seller.pan, sac: seller.sacCode, email: seller.email, phone: seller.phone },
    billedTo: { name: buyer.name === "Unnamed Business" ? "Your business" : buyer.name, lines: addressOf(buyer), gstin: buyer.gstin },
    planName: payment.subscriptionPlan.name,
    planStatus: "Active",
    subscriptionRef: id.slice(-8).toUpperCase(),
    term: payment.interval === "ANNUAL" ? "12 Months" : "1 Month",
    period: `${payment.periodStart ? formatDate(payment.periodStart) : ""} - ${payment.periodEnd ? formatDate(payment.periodEnd) : ""}`,
    paymentMethod: "Razorpay",
    transactionId: payment.razorpayPaymentId ?? "-",
    features: snapshot.highlights,
    amount: money(Number(payment.amount)),
    taxLines: gst.lines.map((line) => ({ label: line.label, amount: money(line.amount) })),
    total: money(Number(payment.total)),
    totalLabel: "Total Paid",
    paymentNote: "Payment received through Razorpay. Your plan is active and all its features are available.",
    footerNote: seller.note,
  });

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${payment.invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
