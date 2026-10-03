import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsPDF } from "jspdf";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";

const formatDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// The design system's colours (globals.css), as RGB for the PDF.
const SUCCESS: [number, number, number] = [22, 163, 74];
const SUCCESS_TINT: [number, number, number] = [232, 246, 237];
const TEXT: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const BORDER: [number, number, number] = [229, 231, 235];

// The standard PDF font has no ₹ glyph, so INR is written "Rs.".
const money = (currency: string, amount: number) => `${currency === "INR" ? "Rs." : currency} ${amount.toLocaleString("en-IN")}`;

const limit = (value: number | null, noun: string) => (value === null ? `Unlimited ${noun}` : `Up to ${value.toLocaleString("en-IN")} ${noun}`);

const STATUS_LABEL: Record<string, string> = { TRIALING: "Trial", ACTIVE: "Active", CANCELLED: "Cancelled", EXPIRED: "Expired", PAST_DUE: "Past due" };

/**
 * A subscription's invoice as a PDF, in AJ's sample format (2026-09-30): header,
 * Subscription Details, Features Included, Payment Summary, a status box and a
 * footer. Generated from the subscription record: there is no payment or
 * transaction model yet, so a trial invoices 0, any other row its plan's price,
 * and the Transaction ID stays blank.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["view"] }, organizationId);

  const [subscription, organization] = await Promise.all([
    prisma.subscription.findFirst({ where: { id, organizationId }, include: { subscriptionPlan: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
  ]);
  if (!subscription) return new Response("Not found", { status: 404 });

  const plan = subscription.subscriptionPlan;
  const trial = subscription.status === "TRIALING";
  const amount = trial ? 0 : Number(plan.priceMonthly ?? 0);
  const periodEnd = subscription.endDate ?? subscription.trialEndsAt;
  const shortId = subscription.id.slice(-8).toUpperCase();
  const yearMonth = `${subscription.startDate.getFullYear()}${String(subscription.startDate.getMonth() + 1).padStart(2, "0")}`;
  const billedTo = organization.name === "Unnamed Business" ? "Your business" : organization.name;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 40;
  const right = 555;
  const text = (color: [number, number, number]) => doc.setTextColor(color[0], color[1], color[2]);
  const rule = (y: number, color = BORDER, width = 1) => doc.setDrawColor(color[0], color[1], color[2]).setLineWidth(width).line(left, y, right, y);

  // --- Header: the Platterly logo on the left, the invoice's number and date on the right ---
  // public/platterly-logo.png is public/platterly-logo.svg rendered once (jsPDF can't draw SVG); 300.18 x 67.66 is the SVG's own ratio.
  const logo = await readFile(path.join(process.cwd(), "public", "platterly-logo.png"));
  doc.addImage(new Uint8Array(logo), "PNG", left, 36, 150, 150 * (67.66 / 300.18));
  text(TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16).text("SUBSCRIPTION INVOICE", right, 56, { align: "right" });
  doc.setFontSize(9).setFont("helvetica", "bold");
  text(MUTED);
  doc.text("Invoice #:", 420, 74, { align: "right" });
  doc.text("Date:", 420, 88, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(`SUB-${yearMonth}-${shortId}`, right, 74, { align: "right" });
  doc.text(formatDate(subscription.startDate), right, 88, { align: "right" });
  rule(108);

  const section = (title: string, y: number) => {
    doc.setFont("helvetica", "bold").setFontSize(13);
    text(TEXT);
    doc.text(title, left, y);
    rule(y + 8);
    return y + 30;
  };

  // --- Subscription Details ---
  let y = section("Subscription Details", 142);
  const details: [string, string][] = [
    ["Subscription ID:", `#${shortId}`],
    ["Plan:", plan.name],
    ["Period:", `${formatDate(subscription.startDate)} - ${periodEnd ? formatDate(periodEnd) : "ongoing"}`],
    ["Billed To:", billedTo],
    ["Payment Method:", trial ? "Free Trial" : "Not recorded yet"],
    ["Transaction ID:", "-"],
  ];
  doc.setFontSize(10);
  for (const [label, value] of details) {
    doc.setFont("helvetica", "bold");
    text(TEXT);
    doc.text(label, left + 2, y);
    doc.setFont("helvetica", "normal").text(value, 190, y);
    y += 22;
  }

  // --- Features Included: the plan's limits, two columns ---
  y = section("Features Included", y + 14);
  const features = [
    limit(plan.maxOrders, "orders"),
    limit(plan.maxEvents, "events"),
    limit(plan.maxCustomers, "customers"),
    limit(plan.maxUsers, "team members"),
    limit(plan.maxKitchens, "kitchens"),
    limit(plan.maxStores, "stores"),
    limit(plan.maxMenuLinks, "menu links"),
    limit(plan.maxWhatsappMessages, "WhatsApp messages"),
  ];
  doc.setFontSize(10).setFont("helvetica", "normal");
  features.forEach((feature, i) => {
    const x = i % 2 === 0 ? left : 310;
    const rowY = y + Math.floor(i / 2) * 24;
    doc.setFillColor(SUCCESS[0], SUCCESS[1], SUCCESS[2]).circle(x + 4, rowY - 3, 3, "F");
    text(TEXT);
    doc.text(feature, x + 16, rowY);
  });
  y += Math.ceil(features.length / 2) * 24 + 4;

  // --- Payment Summary ---
  y = section("Payment Summary", y + 10);
  doc.setFont("helvetica", "bold").setFontSize(10);
  text(TEXT);
  doc.text("Subscription Amount", left + 2, y);
  doc.setFont("helvetica", "normal").text(money(plan.currency, amount), right, y, { align: "right" });
  rule(y + 12, TEXT, 1.5);
  doc.setFont("helvetica", "bold").text("Total Paid", left + 2, y + 32);
  doc.setFontSize(14);
  text(SUCCESS);
  doc.text(money(plan.currency, amount), right, y + 33, { align: "right" });
  y += 62;

  // --- Status box ---
  doc.setFillColor(SUCCESS_TINT[0], SUCCESS_TINT[1], SUCCESS_TINT[2]).setDrawColor(SUCCESS[0], SUCCESS[1], SUCCESS[2]).setLineWidth(0.6).roundedRect(left, y, right - left, 62, 6, 6, "FD");
  doc.setFillColor(SUCCESS[0], SUCCESS[1], SUCCESS[2]).circle(left + 20, y + 22, 5, "F");
  doc.setFont("helvetica", "bold").setFontSize(12);
  text(SUCCESS);
  doc.text(trial ? "Free Trial" : `Subscription ${STATUS_LABEL[subscription.status] ?? subscription.status}`, left + 34, y + 26);
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(
    trial ? "Your free trial is active and nothing is due for this period." : "Payment details for this period aren't recorded yet.",
    left + 20,
    y + 46,
  );
  y += 96;

  // --- Footer ---
  rule(y);
  doc.setFontSize(10);
  text(MUTED);
  doc.text("Thank you for choosing Platterly!", 297.5, y + 26, { align: "center" });
  doc.text("For support, please contact the Platterly team.", 297.5, y + 44, { align: "center" });

  return new Response(doc.output("arraybuffer"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-SUB-${yearMonth}-${shortId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
