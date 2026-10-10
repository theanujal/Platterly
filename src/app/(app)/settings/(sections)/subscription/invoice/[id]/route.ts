import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { renderPlanInvoicePdf, PRODUCT_NAME } from "@/modules/subscriptions/plan-invoice-pdf";

const formatDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

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

  const logo = await readFile(path.join(process.cwd(), "public", "platterly-logo.png"));
  const bytes = renderPlanInvoicePdf({
    logo: new Uint8Array(logo),
    invoiceNumber: `SUB-${yearMonth}-${shortId}`,
    date: formatDate(subscription.startDate),
    productName: PRODUCT_NAME,
    statusLabel: trial ? "TRIAL" : (STATUS_LABEL[subscription.status] ?? subscription.status).toUpperCase(),
    seller: null,
    billedTo: { name: billedTo, lines: [], gstin: null },
    planName: plan.name,
    planStatus: STATUS_LABEL[subscription.status] ?? subscription.status,
    subscriptionRef: shortId,
    term: trial ? "Free trial" : "1 Month",
    period: `${formatDate(subscription.startDate)} - ${periodEnd ? formatDate(periodEnd) : "ongoing"}`,
    paymentMethod: trial ? "Free Trial" : "Not recorded yet",
    transactionId: "-",
    features: [
      limit(plan.maxOrders, "orders"),
      limit(plan.maxEvents, "events"),
      limit(plan.maxCustomers, "customers"),
      limit(plan.maxUsers, "team members"),
      limit(plan.maxKitchens, "kitchens"),
      limit(plan.maxStores, "stores"),
      limit(plan.maxMenuLinks, "menu links"),
      limit(plan.maxWhatsappMessages, "WhatsApp messages"),
    ],
    amount: money(plan.currency, amount),
    taxLines: [],
    total: money(plan.currency, amount),
    totalLabel: trial ? "Total Due" : "Total Paid",
    paymentNote: trial ? "Your free trial is active and nothing is due for this period." : "Payment details for this period aren't recorded yet.",
    footerNote: null,
  });

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-SUB-${yearMonth}-${shortId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
