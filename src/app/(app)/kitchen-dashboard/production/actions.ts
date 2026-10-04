"use server";

import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { takeOrderStock } from "@/modules/production/production";

export type TakeStockResult = { ok: true; shortages: { name: string; short: number }[] } | { ok: false; error: string };

/** Confirms the stock take for an order that is with the kitchen. Needs permission to change inventory. */
export async function takeOrderStockAction(orderId: string): Promise<TakeStockResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  try {
    const result = await takeOrderStock(organizationId, orderId, session.user.id);
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/kitchen-dashboard/production");
    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    return { ok: true, shortages: result.shortages };
  } catch (error) {
    return { ok: false, error: userMessage(error, "Something went wrong.") };
  }
}
