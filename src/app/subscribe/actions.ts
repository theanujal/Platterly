"use server";

import { revalidatePath } from "next/cache";
import { userMessage } from "@/lib/errors";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import type { BillingInterval } from "@/generated/prisma/enums";
import { cancelScheduledDowngrade, reportAutoPayFailed, scheduleDowngrade, setAutoPayPaused, startCheckout, verifyCheckout } from "@/modules/subscriptions/billing-source";

// Paying for a plan is the owner's call (`tenant: edit`), the same people who can change the business profile.
// Each action states its own check, so the guard is visible where the action is.

const isInterval = (value: string): value is BillingInterval => value === "MONTHLY" || value === "ANNUAL";

export async function startCheckoutAction(planId: string, interval: string) {
  const { session, organizationId } = await requireActiveOrganization({ allowLocked: true });
  await requirePermission({ tenant: ["edit"] }, organizationId);
  const userId = session.user.id;
  if (!isInterval(interval)) return { ok: false as const, error: "Choose monthly or yearly." };
  try {
    return { ok: true as const, ...(await startCheckout(organizationId, planId, interval, userId)) };
  } catch (error) {
    return { ok: false as const, error: userMessage(error, "We could not start the payment. Please try again.") };
  }
}

export async function verifyCheckoutAction(response: { razorpay_order_id?: string; razorpay_subscription_id?: string; razorpay_payment_id: string; razorpay_signature: string }) {
  const { organizationId } = await requireActiveOrganization({ allowLocked: true });
  await requirePermission({ tenant: ["edit"] }, organizationId);
  // Razorpay's checkout answers with a subscription id for monthly auto-pay, an order id otherwise.
  const id = response.razorpay_subscription_id ? { razorpaySubscriptionId: response.razorpay_subscription_id } : { razorpayOrderId: response.razorpay_order_id ?? "" };
  let result: { confirmed: boolean; failed: boolean };
  try {
    result = await verifyCheckout(organizationId, { ...id, razorpayPaymentId: response.razorpay_payment_id, signature: response.razorpay_signature });
  } catch (error) {
    return { ok: false as const, error: userMessage(error, "We could not verify this payment.") };
  }
  revalidatePath("/", "layout");
  return { ok: true as const, ...result };
}

/** Best effort: the owner's message doesn't wait on ops, so a failure to report is only logged. */
export async function reportAutoPayFailedAction(razorpaySubscriptionId: string, reason: "declined" | "not_finished", detail: string | null) {
  const { organizationId } = await requireActiveOrganization({ allowLocked: true });
  await requirePermission({ tenant: ["edit"] }, organizationId);
  try {
    await reportAutoPayFailed(organizationId, razorpaySubscriptionId, reason, detail?.slice(0, 500) ?? null);
  } catch (error) {
    console.error("[billing] could not report a failed auto-pay setup", error);
  }
}

export async function setAutoPayPausedAction(paused: boolean) {
  const { organizationId } = await requireActiveOrganization({ allowLocked: true });
  await requirePermission({ tenant: ["edit"] }, organizationId);
  try {
    await setAutoPayPaused(organizationId, paused);
  } catch (error) {
    return { ok: false as const, error: userMessage(error, paused ? "Could not pause the subscription." : "Could not resume the subscription.") };
  }
  revalidatePath("/settings/subscription");
  revalidatePath("/subscribe");
  return { ok: true as const };
}

export async function scheduleDowngradeAction(planId: string, interval: string) {
  const { session, organizationId } = await requireActiveOrganization({ allowLocked: true });
  await requirePermission({ tenant: ["edit"] }, organizationId);
  const userId = session.user.id;
  if (!isInterval(interval)) return { ok: false as const, error: "Choose monthly or yearly." };
  try {
    await scheduleDowngrade(organizationId, planId, interval, userId);
  } catch (error) {
    return { ok: false as const, error: userMessage(error, "Could not schedule the change.") };
  }
  revalidatePath("/subscribe");
  revalidatePath("/settings/subscription");
  return { ok: true as const };
}

export async function cancelDowngradeAction() {
  const { session, organizationId } = await requireActiveOrganization({ allowLocked: true });
  await requirePermission({ tenant: ["edit"] }, organizationId);
  const userId = session.user.id;
  await cancelScheduledDowngrade(organizationId, userId);
  revalidatePath("/subscribe");
  revalidatePath("/settings/subscription");
  return { ok: true as const };
}
