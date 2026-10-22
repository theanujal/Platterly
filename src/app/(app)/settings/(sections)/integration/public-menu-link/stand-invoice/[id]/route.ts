import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getStandInvoice } from "@/modules/stand/stand-orders";
import { renderPlanInvoicePdf, PRODUCT_NAME } from "@/modules/subscriptions/plan-invoice-pdf";
import { inrPdf } from "@/modules/invoices/invoice-format";

// IST, so the invoice date matches the month in its number.
const formatDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const addressOf = (p: { addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null }) =>
  [p.addressLine1, p.addressLine2, [p.city, p.postalCode].filter(Boolean).join(" "), p.state, p.country].filter(Boolean) as string[];

/**
 * The GST tax invoice for one paid Order QR stand order, in the same layout as the plan invoice, printed from the copy ops froze
 * when the payment was confirmed. Owner only (the same people who can order it).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ tenant: ["edit"] }, organizationId);

  const invoice = await getStandInvoice(organizationId, id);
  if (!invoice) return new Response("Not found", { status: 404 });
  const { seller, buyer, gst } = invoice;
  const stands = `${invoice.quantity} stand${invoice.quantity === 1 ? "" : "s"}`;
  const logo = await readFile(path.join(process.cwd(), "public", "platterly-logo.png"));
  const bytes = renderPlanInvoicePdf({
    logo: new Uint8Array(logo),
    invoiceNumber: invoice.invoiceNumber,
    date: formatDate(new Date(invoice.paidAt)),
    productName: PRODUCT_NAME,
    statusLabel: "PAID",
    seller: { name: seller.legalName ?? "Platterly", lines: addressOf(seller), gstin: seller.gstin, pan: seller.pan, sac: seller.sacCode, email: seller.email, phone: seller.phone },
    billedTo: { name: buyer.name === "Unnamed Business" ? "Your business" : buyer.name, lines: addressOf(buyer), gstin: buyer.gstin },
    planName: `Order QR stand x ${invoice.quantity}`,
    planStatus: "Paid",
    subscriptionRef: invoice.orderId.slice(-8).toUpperCase(),
    term: stands,
    period: `Ship to: ${invoice.shipTo.city}, ${invoice.shipTo.state}`,
    paymentMethod: "Razorpay",
    transactionId: invoice.razorpayPaymentId ?? "-",
    features: ["A6 (4 x 6 in) acrylic stand", "Your logo, name and QR code to your link", "Printed and shipped to you, shipping included"],
    amount: inrPdf(invoice.amount),
    taxLines: gst.lines.map((line) => ({ label: line.label, amount: inrPdf(line.amount) })),
    total: inrPdf(invoice.total),
    totalLabel: "Total Paid",
    paymentNote: "Payment received through Razorpay. Your stands will be printed and shipped to the address on your order.",
    footerNote: seller.note,
    labels: { cardTitle: "ORDER QR STAND", refLabel: "Order ID", detailsTitle: "Order Details", periodLabel: "Shipping", termLabel: "Quantity", featuresTitle: "What is included in", amountLabel: "Order Amount", codeLabel: "HSN/SAC" },
  });

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
