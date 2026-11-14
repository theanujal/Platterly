"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { markAbandonedOrderFollowedUp } from "@/modules/abandoned-orders/abandoned-orders";

export async function markFollowedUpAction(formData: FormData): Promise<void> {
  await requireStaff();
  await markAbandonedOrderFollowedUp(String(formData.get("id") ?? ""));
  revalidatePath("/abandoned-orders");
}
