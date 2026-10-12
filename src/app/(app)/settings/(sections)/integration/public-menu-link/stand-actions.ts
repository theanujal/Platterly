"use server";

import { revalidatePath } from "next/cache";
import { userMessage } from "@/lib/errors";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { startStandOrder, verifyStandOrder } from "@/modules/stand/stand-orders";

// Ordering a paid, shipped product is the owner's call (`tenant: edit`), like paying for the plan.

export async function startStandOrderAction(quantity: number, shipTo: unknown) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ tenant: ["edit"] }, organizationId);
  try {
    return { ok: true as const, ...(await startStandOrder(organizationId, quantity, shipTo)) };
  } catch (error) {
    return { ok: false as const, error: userMessage(error, "We could not start the payment. Please try again.") };
  }
}

export async function verifyStandOrderAction(response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ tenant: ["edit"] }, organizationId);
  try {
    await verifyStandOrder(organizationId, { razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, signature: response.razorpay_signature });
  } catch (error) {
    return { ok: false as const, error: userMessage(error, "We could not verify this payment.") };
  }
  revalidatePath("/settings/integration/public-menu-link");
  return { ok: true as const };
}
