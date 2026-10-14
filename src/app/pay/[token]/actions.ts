"use server";

import { publicActionLimited } from "@/lib/public-rate-limit";
import { prisma } from "@/lib/db";
import { claimUpiPayment, confirmRazorpayPayment, startRazorpayCheckout } from "@/modules/payments/checkout";
import { PaymentError } from "@/modules/payments/payment";
import { resolvePaymentLink } from "@/modules/payments/payment-links";
import { getRazorpayCredentials } from "@/modules/payments/payment-settings";
import { verifyCheckoutSignature } from "@/modules/payments/razorpay";

const INACTIVE = "This link is no longer active. If you have already paid, there is nothing more to do.";

async function tooManyRequests(): Promise<boolean> {
  return publicActionLimited("pay-link", 40);
}

export type StartResult =
  | { ok: true; keyId: string; razorpayOrderId: string; amountPaise: number; businessName: string; description: string }
  | { ok: false; error: string };

export async function startCheckoutAction(token: string): Promise<StartResult> {
  if (await tooManyRequests()) return { ok: false, error: "Too many attempts. Please try again later." };
  const link = await resolvePaymentLink(token);
  if (!link) return { ok: false, error: INACTIVE };
  try {
    return { ok: true, ...(await startRazorpayCheckout(link)) };
  } catch (error) {
    if (error instanceof PaymentError) return { ok: false, error: error.message };
    console.error("[pay]", error);
    return { ok: false, error: "We could not start the payment. Please try again." };
  }
}

/** Razorpay Checkout's own callback, verified with the kitchen's key secret before anything is marked paid. */
export async function verifyCheckoutAction(token: string, response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }): Promise<{ ok: boolean; error?: string }> {
  if (await tooManyRequests()) return { ok: false, error: "Too many attempts. Please try again later." };
  const link = await resolvePaymentLink(token);
  if (!link) return { ok: false, error: INACTIVE };
  const creds = await getRazorpayCredentials(link.organizationId);
  if (!creds) return { ok: false, error: INACTIVE };
  const valid = verifyCheckoutSignature({ razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, signature: response.razorpay_signature }, creds.keySecret);
  if (!valid) return { ok: false, error: "We could not verify this payment. If money left your account, the kitchen will confirm it shortly." };
  // The Razorpay order must be one this very link started.
  const owned = await prisma.payment.findFirst({ where: { organizationId: link.organizationId, paymentLinkId: link.linkId, razorpayOrderId: response.razorpay_order_id } });
  if (!owned) return { ok: false, error: INACTIVE };
  await confirmRazorpayPayment(link.organizationId, response.razorpay_order_id, response.razorpay_payment_id);
  return { ok: true };
}

/** The UPI transaction number (UTR): 6 to 30 letters and digits, as a UPI app shows it. */
const TRANSACTION_NUMBER = /^[A-Za-z0-9]{6,30}$/;

export async function claimUpiAction(token: string, transactionNumber: string): Promise<{ ok: boolean; error?: string }> {
  const reference = transactionNumber.replace(/\s+/g, "");
  if (!TRANSACTION_NUMBER.test(reference)) return { ok: false, error: "Enter the transaction number from your UPI app (6 to 30 letters and numbers)." };
  if (await tooManyRequests()) return { ok: false, error: "Too many attempts. Please try again later." };
  const link = await resolvePaymentLink(token);
  if (!link || !link.upi) return { ok: false, error: INACTIVE };
  try {
    await claimUpiPayment(link, reference);
    return { ok: true };
  } catch (error) {
    if (error instanceof PaymentError) return { ok: false, error: error.message };
    throw error;
  }
}
