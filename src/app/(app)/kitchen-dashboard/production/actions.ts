"use server";

import { assertOrderAtMyLocation } from "@/modules/locations/active-location";
import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { returnOrderItem, sendOrderItems } from "@/modules/production/production";

export type SendItemsResult = { ok: true; shortages: { name: string; short: number }[] } | { ok: false; error: string };
export type ReturnItemResult = { ok: true; message: string } | { ok: false; error: string };

function refresh(orderId: string) {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/kitchen-dashboard/production");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

/** "Send items to this order": takes what the order still requires from the shelf. Needs permission to change inventory. */
export async function sendOrderItemsAction(orderId: string): Promise<SendItemsResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  await assertOrderAtMyLocation(organizationId, session.user.id, orderId);
  try {
    const result = await sendOrderItems(organizationId, orderId, session.user.id);
    refresh(orderId);
    return { ok: true, shortages: result.shortages };
  } catch (error) {
    return { ok: false, error: userMessage(error, "Something went wrong.") };
  }
}

/** Undo for one item: puts what was sent for it back on the shelf. */
export async function returnOrderItemAction(orderId: string, inventoryId: string): Promise<ReturnItemResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  await assertOrderAtMyLocation(organizationId, session.user.id, orderId);
  try {
    const result = await returnOrderItem(organizationId, orderId, inventoryId, session.user.id);
    refresh(orderId);
    return { ok: true, message: `${result.quantity} ${result.unit} of ${result.name} returned to stock.` };
  } catch (error) {
    return { ok: false, error: userMessage(error, "Something went wrong.") };
  }
}
