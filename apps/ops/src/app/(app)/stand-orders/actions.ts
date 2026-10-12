"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { BillingError } from "@/modules/billing/billing";
import { advanceStandOrder, setStandPricing } from "@/modules/stand/stand";

export interface StandFormState {
  error?: string;
  saved?: boolean;
}

/** Price of ONE stand before GST, and the GST rate. An empty price takes the stand off sale. */
export async function saveStandPricingAction(_prev: StandFormState, formData: FormData): Promise<StandFormState> {
  const staff = await requireStaff();
  const productKey = String(formData.get("productKey") ?? "");
  const rawPrice = String(formData.get("price") ?? "").trim();
  const price = rawPrice === "" ? null : Number(rawPrice);
  const gstPercent = Number(String(formData.get("gstPercent") ?? "").trim() || "18");
  if (price !== null && Number.isNaN(price)) return { error: "Enter the price as a number." };
  try {
    await setStandPricing(productKey, { price, gstPercent, hsnCode: String(formData.get("hsnCode") ?? "") }, staff.id);
    revalidatePath("/stand-orders");
    return { saved: true };
  } catch (error) {
    if (error instanceof BillingError) return { error: error.message };
    throw error;
  }
}

/** One step forward: Printing, Shipped (with a delivery note, and the owner is emailed) or Delivered. */
export async function advanceStandOrderAction(_prev: StandFormState, formData: FormData): Promise<StandFormState> {
  const staff = await requireStaff();
  const id = String(formData.get("id") ?? "");
  try {
    await advanceStandOrder(id, { trackingNote: String(formData.get("trackingNote") ?? "") }, staff.id);
    revalidatePath(`/stand-orders/${id}`);
    revalidatePath("/stand-orders");
    return { saved: true };
  } catch (error) {
    if (error instanceof BillingError) return { error: error.message };
    throw error;
  }
}
