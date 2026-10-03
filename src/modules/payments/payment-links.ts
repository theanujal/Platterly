import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { originFor } from "@/lib/routing/hosts";
import { issueToken, resolveToken } from "@/lib/secure-access/token";
import { emailPayload, loadOrderContext, notifyCustomer } from "@/modules/notifications/triggers";
import { getChannelSettings } from "@/modules/notifications/channel-settings";
import { advanceAmount, round2 } from "./payment-math";
import { PaymentError, orderBalance } from "./payment";
import { getPaymentSettingsView, getRazorpayCredentials } from "./payment-settings";
import type { PaymentType } from "@/generated/prisma/enums";

const catering = () => originFor("catering");

export async function invoiceUrl(organizationId: string, invoiceId: string): Promise<string> {
  // The invoice must be this kitchen's own: a link is never issued for another kitchen's record (Chunk 17.3).
  await prisma.invoice.findFirstOrThrow({ where: { id: invoiceId, organizationId }, select: { id: true } });
  const existing = await prisma.secureAccessToken.findFirst({ where: { organizationId, resourceType: "INVOICE", resourceId: invoiceId, revokedAt: null } });
  const token = existing ?? (await issueToken({ organizationId, resourceType: "INVOICE", resourceId: invoiceId }));
  return `${catering()}/invoice/${token.token}`;
}

export type PaymentLinkKind = "ADVANCE" | "BALANCE" | "CUSTOM";

/** A link for an advance (the kitchen's advance %), the balance, or any amount up to the balance. */
export async function createPaymentLink(params: { organizationId: string; orderId: string; kind: PaymentLinkKind; amount?: number; invoiceId?: string | null; actorUserId?: string }) {
  const { total, paid, balance } = await orderBalance(params.organizationId, params.orderId);
  if (balance <= 0) throw new PaymentError("This order is already paid in full.");
  const settings = await getPaymentSettingsView(params.organizationId);

  let amount: number;
  let type: PaymentType;
  if (params.kind === "ADVANCE") {
    amount = advanceAmount(total, paid, settings.advancePercent);
    type = "ADVANCE";
  } else if (params.kind === "BALANCE") {
    amount = balance;
    type = paid > 0 ? "FINAL" : "ADVANCE";
  } else {
    amount = round2(params.amount ?? 0);
    type = amount + 0.005 >= balance ? (paid > 0 ? "FINAL" : "ADVANCE") : paid > 0 ? "PARTIAL" : "ADVANCE";
  }
  if (!(amount > 0)) throw new PaymentError("Enter an amount greater than zero.");
  if (amount > balance + 0.005) throw new PaymentError(`That is more than the balance of ₹${balance.toLocaleString("en-IN")}.`);

  const link = await prisma.paymentLink.create({
    data: { organizationId: params.organizationId, orderId: params.orderId, invoiceId: params.invoiceId ?? null, type, amount, createdByUserId: params.actorUserId },
  });
  const token = await issueToken({ organizationId: params.organizationId, resourceType: "PAYMENT_LINK", resourceId: link.id });
  await audit({ organizationId: params.organizationId, actorUserId: params.actorUserId, action: "payment_link.create", recordType: "PaymentLink", recordId: link.id, after: { amount, type } });
  return { link, url: `${catering()}/pay/${token.token}` };
}

export interface ResolvedPaymentLink {
  linkId: string;
  organizationId: string;
  orderId: string;
  orderNumber: string;
  businessName: string;
  businessLogo: string | null;
  customerName: string;
  eventLabel: string;
  amount: number;
  type: PaymentType;
  balance: number;
  /** The Razorpay key id is public by design (Checkout needs it in the browser). */
  razorpayKeyId: string | null;
  upi: { upiId: string; payeeName: string } | null;
}

/** Null for every failure (wrong token, expired, other tenant, already paid): no way to tell them apart. */
export async function resolvePaymentLink(token: string): Promise<ResolvedPaymentLink | null> {
  const resolved = await resolveToken(token);
  if (!resolved || resolved.resourceType !== "PAYMENT_LINK") return null;
  const link = await prisma.paymentLink.findFirst({
    where: { id: resolved.resourceId, organizationId: resolved.organizationId },
    include: {
      organization: { select: { name: true, logo: true } },
      order: { select: { orderNumber: true, status: true, eventStartDate: true, customer: { select: { name: true } }, eventType: { select: { name: true } } } },
    },
  });
  if (!link || link.order.status === "CANCELLED") return null;
  const { balance } = await orderBalance(link.organizationId, link.orderId);
  if (balance <= 0) return null;

  const [creds, settings] = await Promise.all([getRazorpayCredentials(link.organizationId), getPaymentSettingsView(link.organizationId)]);
  // Only the methods the kitchen has switched on are offered.
  const when = link.order.eventStartDate?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return {
    linkId: link.id,
    organizationId: link.organizationId,
    orderId: link.orderId,
    orderNumber: link.order.orderNumber ?? "your order",
    businessName: link.organization.name,
    businessLogo: link.organization.logo,
    customerName: link.order.customer.name,
    eventLabel: [link.order.eventType?.name, when].filter(Boolean).join(" on "),
    // Never ask for more than is still owed.
    amount: Math.min(Number(link.amount), balance),
    type: link.type,
    balance,
    razorpayKeyId: settings.razorpay.enabled ? (creds?.keyId ?? null) : null,
    upi: settings.upi?.enabled ? { upiId: settings.upi.upiId, payeeName: settings.upi.payeeName } : null,
  };
}

/** Tells the customer about a payment link. Logged until the email provider is live (Chunk 16). */
export async function sendPaymentLink(params: { organizationId: string; orderId: string; url: string; amount: number }) {
  const context = await loadOrderContext(params.organizationId, params.orderId);
  const email = await getChannelSettings(params.organizationId, "email");
  await notifyCustomer({
    organizationId: params.organizationId,
    event: "payment.link_sent",
    email: context.customerEmail,
    phone: context.customerPhone,
    payload: emailPayload(context, { template: "paymentRequest", amount: params.amount, url: params.url }),
  });
  return { emailActive: email.active };
}
