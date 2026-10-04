import { emitPayment } from "@/modules/webhooks/emit";
import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { onPaymentActivity } from "@/modules/notifications/triggers";
import { sendReceiptForPayment } from "@/modules/invoices/invoice-send";
import { issueReceipt, PaymentError, recordPayment, syncOrderPayments } from "./payment";
import type { ResolvedPaymentLink } from "./payment-links";
import { getRazorpayCredentials } from "./payment-settings";
import { createRazorpayOrder } from "./razorpay";
import { paymentMethodForRazorpay } from "./payment-math";

/**
 * Starts a Razorpay Checkout for a payment link, with the KITCHEN's own keys. A PENDING payment is
 * recorded up front (so the webhook can find it by Razorpay order id); it becomes CONFIRMED only
 * when Razorpay says so, never because the browser claims it.
 */
export async function startRazorpayCheckout(link: ResolvedPaymentLink) {
  const creds = await getRazorpayCredentials(link.organizationId);
  if (!creds || link.razorpayKeyId === null) throw new PaymentError("This kitchen is not taking online payments right now.");
  const { razorpayOrderId } = await createRazorpayOrder(creds, {
    amountRupees: link.amount,
    receipt: link.orderNumber,
    notes: { orderId: link.orderId, paymentLinkId: link.linkId },
  });
  await recordPayment({
    organizationId: link.organizationId,
    orderId: link.orderId,
    paymentLinkId: link.linkId,
    amount: link.amount,
    type: link.type,
    method: "UPI",
    source: "RAZORPAY",
    status: "PENDING",
    razorpayOrderId,
  });
  return { keyId: creds.keyId, razorpayOrderId, amountPaise: Math.round(link.amount * 100), businessName: link.businessName, description: `Order ${link.orderNumber}` };
}

/**
 * Razorpay says this payment was captured (checkout verification or webhook, whichever comes first).
 * Safe to call twice: only the call that flips PENDING to CONFIRMED does the work, so a webhook
 * delivered twice makes one payment and one receipt.
 */
export async function confirmRazorpayPayment(organizationId: string, razorpayOrderId: string, razorpayPaymentId: string, method?: string, capturedPaise?: number) {
  const payment = await prisma.payment.findFirst({ where: { organizationId, razorpayOrderId, source: "RAZORPAY" } });
  if (!payment) return null;
  if (payment.status === "CONFIRMED") return payment;
  // The webhook says how much Razorpay actually captured. If that is not what this payment asked for, it is not this payment: never confirm it.
  if (capturedPaise !== undefined && capturedPaise !== Math.round(Number(payment.amount) * 100)) {
    console.error("[payments] captured amount does not match", payment.id);
    return null;
  }
  const claimed = await prisma.payment.updateMany({
    where: { id: payment.id, status: "PENDING" },
    data: { status: "CONFIRMED", razorpayPaymentId, confirmedAt: new Date(), ...(method ? { method: paymentMethodForRazorpay(method) } : {}) },
  });
  if (claimed.count === 0) return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });

  await syncOrderPayments(payment.orderId);
  await issueReceipt(organizationId, payment.id);
  // The customer paid through the link, so they get the receipt without anyone clicking anything.
  await sendReceiptForPayment(organizationId, payment.id);
  await onPaymentActivity(organizationId, payment.orderId, Number(payment.amount), "received");
  await emitPayment(organizationId, "payment.updated", payment.id);
  await audit({ organizationId, action: "payment.razorpay_confirmed", recordType: "Payment", recordId: payment.id, after: { amount: Number(payment.amount), razorpayPaymentId } });
  return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
}

export async function failRazorpayPayment(organizationId: string, razorpayOrderId: string) {
  const pending = await prisma.payment.findMany({ where: { organizationId, razorpayOrderId, source: "RAZORPAY", status: "PENDING" }, select: { id: true } });
  const failed = await prisma.payment.updateMany({ where: { id: { in: pending.map((p) => p.id) }, status: "PENDING" }, data: { status: "FAILED" } });
  if (failed.count > 0) for (const { id } of pending) await emitPayment(organizationId, "payment.failed", id);
}

/** "I have paid" on a UPI QR: waits for the kitchen to confirm it reached their account. */
export async function claimUpiPayment(link: ResolvedPaymentLink) {
  const payment = await recordPayment({
    organizationId: link.organizationId,
    orderId: link.orderId,
    paymentLinkId: link.linkId,
    amount: link.amount,
    type: link.type,
    method: "UPI",
    source: "UPI_QR",
    status: "PENDING",
  });
  await onPaymentActivity(link.organizationId, link.orderId, link.amount, "upi_claimed");
  return payment;
}
