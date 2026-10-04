import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsPDF } from "jspdf";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import type { InvoiceSnapshot } from "@/modules/subscriptions/invoice-snapshot";

const SUCCESS: [number, number, number] = [22, 163, 74];
const SUCCESS_TINT: [number, number, number] = [232, 246, 237];
const TEXT: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const BORDER: [number, number, number] = [229, 231, 235];

// IST, so the invoice date matches the month in its number.
const formatDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
// The standard PDF font has no rupee glyph, so INR is written "Rs.".
const money = (amount: number) => `Rs. ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const addressOf = (p: { addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null }) =>
  [p.addressLine1, p.addressLine2, [p.city, p.postalCode].filter(Boolean).join(" "), p.state, p.country].filter(Boolean) as string[];

/**
 * The GST tax invoice for one paid plan payment (Chunk 20), in AJ's sample layout plus the seller and buyer blocks
 * and the GST split. Printed from the snapshot taken when the payment was confirmed, so a later change to Platterly's
 * or the caterer's details never rewrites an old invoice. Only that caterer can download it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization({ allowLocked: true });
  await requirePermission({ settings: ["view"] }, organizationId);

  const payment = await prisma.subscriptionPayment.findFirst({ where: { id, organizationId, status: "PAID" }, include: { subscriptionPlan: true } });
  const snapshot = payment?.invoiceSnapshot as InvoiceSnapshot | null | undefined;
  if (!payment || !snapshot || !payment.invoiceNumber || !payment.paidAt) return new Response("Not found", { status: 404 });
  const { seller, buyer, gst } = snapshot;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 40;
  const right = 555;
  const color = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const rule = (y: number, c = BORDER, width = 1) => doc.setDrawColor(c[0], c[1], c[2]).setLineWidth(width).line(left, y, right, y);

  // --- Header ---
  const logo = await readFile(path.join(process.cwd(), "public", "platterly-logo.png"));
  doc.addImage(new Uint8Array(logo), "PNG", left, 34, 150, 150 * (67.66 / 300.18));
  color(TEXT);
  doc.setFont("helvetica", "bold").setFontSize(16).text("TAX INVOICE", right, 52, { align: "right" });
  doc.setFontSize(9);
  color(MUTED);
  doc.text("Invoice #:", 440, 70, { align: "right" });
  doc.text("Date:", 440, 84, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(payment.invoiceNumber, right, 70, { align: "right" });
  doc.text(formatDate(payment.paidAt), right, 84, { align: "right" });
  rule(102);

  // --- Billed by / Billed to ---
  const party = (x: number, title: string, name: string, lines: string[], gstin: string | null, extra: string[]) => {
    let y = 124;
    doc.setFont("helvetica", "bold").setFontSize(9);
    color(MUTED);
    doc.text(title.toUpperCase(), x, y);
    y += 15;
    color(TEXT);
    doc.setFontSize(11).text(name, x, y);
    doc.setFont("helvetica", "normal").setFontSize(9);
    for (const line of [...lines, ...(gstin ? [`GSTIN: ${gstin}`] : []), ...extra]) {
      y += 13;
      doc.text(line, x, y, { maxWidth: 240 });
    }
    return y;
  };
  const sellerLines = [...addressOf(seller), seller.pan ? `PAN: ${seller.pan}` : ""].filter(Boolean);
  const endA = party(left, "Billed by", seller.legalName ?? "Platterly", sellerLines, seller.gstin, [seller.email ?? "", seller.phone ?? ""].filter(Boolean));
  const endB = party(310, "Billed to", buyer.name === "Unnamed Business" ? "Your business" : buyer.name, addressOf(buyer), buyer.gstin, []);
  let y = Math.max(endA, endB) + 22;

  const section = (title: string, at: number) => {
    doc.setFont("helvetica", "bold").setFontSize(13);
    color(TEXT);
    doc.text(title, left, at);
    rule(at + 8);
    return at + 28;
  };

  // --- Subscription Details ---
  y = section("Subscription Details", y);
  const details: [string, string][] = [
    ["Plan:", `${payment.subscriptionPlan.name} - ${payment.interval === "ANNUAL" ? "12 Months" : "1 Month"}`],
    ["Period:", `${payment.periodStart ? formatDate(payment.periodStart) : ""} - ${payment.periodEnd ? formatDate(payment.periodEnd) : ""}`],
    ["SAC:", seller.sacCode],
    ["Payment Method:", "Razorpay"],
    ["Transaction ID:", payment.razorpayPaymentId ?? ""],
  ];
  doc.setFontSize(10);
  for (const [label, value] of details) {
    doc.setFont("helvetica", "bold");
    color(TEXT);
    doc.text(label, left + 2, y);
    doc.setFont("helvetica", "normal").text(value, 190, y);
    y += 20;
  }

  // --- Features Included ---
  if (snapshot.highlights.length > 0) {
    y = section("Features Included", y + 8);
    doc.setFontSize(10).setFont("helvetica", "normal");
    snapshot.highlights.forEach((feature, i) => {
      const x = i % 2 === 0 ? left : 310;
      const rowY = y + Math.floor(i / 2) * 24;
      doc.setFillColor(SUCCESS[0], SUCCESS[1], SUCCESS[2]).circle(x + 4, rowY - 3, 3, "F");
      color(TEXT);
      doc.text(feature, x + 16, rowY, { maxWidth: 230 });
    });
    y += Math.ceil(snapshot.highlights.length / 2) * 24;
  }

  // --- Payment Summary ---
  y = section("Payment Summary", y + 6);
  const row = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(10);
    color(TEXT);
    doc.text(label, left + 2, y);
    doc.text(value, right, y, { align: "right" });
    y += 20;
  };
  row("Subscription Amount", money(Number(payment.amount)), true);
  for (const line of gst.lines) row(line.label, money(line.amount));
  rule(y - 8, TEXT, 1.5);
  y += 8;
  doc.setFont("helvetica", "bold").setFontSize(10);
  color(TEXT);
  doc.text("Total Paid", left + 2, y);
  doc.setFontSize(14);
  color(SUCCESS);
  doc.text(money(Number(payment.total)), right, y + 1, { align: "right" });
  y += 30;

  // --- Status box ---
  doc.setFillColor(SUCCESS_TINT[0], SUCCESS_TINT[1], SUCCESS_TINT[2]).setDrawColor(SUCCESS[0], SUCCESS[1], SUCCESS[2]).setLineWidth(0.6).roundedRect(left, y, right - left, 56, 6, 6, "FD");
  doc.setFillColor(SUCCESS[0], SUCCESS[1], SUCCESS[2]).circle(left + 20, y + 20, 5, "F");
  doc.setFont("helvetica", "bold").setFontSize(12);
  color(SUCCESS);
  doc.text("Payment Successful", left + 34, y + 24);
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text("Your subscription is active and all plan features are available.", left + 20, y + 42);
  y += 80;

  // --- Footer ---
  rule(y);
  doc.setFontSize(9);
  color(MUTED);
  let footerY = y + 22;
  if (seller.note) {
    doc.text(seller.note, 297.5, footerY, { align: "center", maxWidth: 480 });
    footerY += 28;
  }
  doc.text("Thank you for choosing Platterly!", 297.5, footerY, { align: "center" });
  doc.text("This is a computer-generated invoice and does not need a signature.", 297.5, footerY + 14, { align: "center" });

  return new Response(doc.output("arraybuffer"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${payment.invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
