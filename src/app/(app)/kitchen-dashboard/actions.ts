"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { advanceKitchenProductionStatus, InvalidMenuSelectionTransitionError } from "@/modules/menu-approvals/menu-approval";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function advanceKitchenProductionStatusAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    await advanceKitchenProductionStatus(organizationId, id, session.user.id);
  } catch (error) {
    if (error instanceof InvalidMenuSelectionTransitionError) {
      return { ok: false, error: "This menu selection can no longer move to the next kitchen stage." };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
  revalidatePath("/kitchen-dashboard");
  return { ok: true };
}
