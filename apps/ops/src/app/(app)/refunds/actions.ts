"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { BillingError } from "@/modules/billing/billing-error";
import { RazorpayError } from "@/modules/billing/razorpay";
import { approveRefund, rejectRefund } from "@/modules/billing/refunds";

export interface RefundFormState {
  error?: string;
  done?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function approveRefundAction(_prev: RefundFormState, formData: FormData): Promise<RefundFormState> {
  const staff = await requireStaff();
  const endMode = text(formData, "endMode") === "END_NOW" ? "END_NOW" : text(formData, "endMode") === "KEEP_TO_PERIOD_END" ? "KEEP_TO_PERIOD_END" : null;
  if (!endMode) return { error: "Choose what happens to the plan." };
  try {
    const refund = await approveRefund({ requestId: text(formData, "requestId"), totalRupees: Number(text(formData, "total")), endMode, actorUserId: staff.id });
    revalidatePath("/refunds");
    return { done: refund.creditNoteNumber };
  } catch (error) {
    if (error instanceof BillingError) return { error: error.message };
    if (error instanceof RazorpayError) return { error: `Razorpay did not accept the refund: ${error.message}. Nothing was changed.` };
    throw error;
  }
}

export async function declineRefundAction(_prev: RefundFormState, formData: FormData): Promise<RefundFormState> {
  const staff = await requireStaff();
  try {
    await rejectRefund({ requestId: text(formData, "requestId"), note: text(formData, "note"), actorUserId: staff.id });
    revalidatePath("/refunds");
    return { done: "declined" };
  } catch (error) {
    if (error instanceof BillingError) return { error: error.message };
    throw error;
  }
}
