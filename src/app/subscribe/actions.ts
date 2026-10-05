"use server";

import { revalidatePath } from "next/cache";
import { userMessage } from "@/lib/errors";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import type { BillingInterval } from "@/generated/prisma/enums";
import { cancelScheduledDowngrade, scheduleDowngrade, startCheckout, verifyCheckout } from "@/modules/subscriptions/billing-source";

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

export async function verifyCheckoutAction(response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  const { organizationId } = await requireActiveOrganization({ allowLocked: true });
  await requirePermission({ tenant: ["edit"] }, organizationId);
  try {
    await verifyCheckout(organizationId, { razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, signature: response.razorpay_signature });
  } catch (error) {
    return { ok: false as const, error: userMessage(error, "We could not verify this payment.") };
  }
  revalidatePath("/", "layout");
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
