"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { setKitchenProductionStatus, InvalidMenuSelectionTransitionError } from "@/modules/menu-approvals/menu-approval";
import type { KitchenProductionStatus } from "@/generated/prisma/enums";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function setKitchenProductionStatusAction(id: string, status: KitchenProductionStatus): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    await setKitchenProductionStatus(organizationId, id, status, session.user.id);
  } catch (error) {
    if (error instanceof InvalidMenuSelectionTransitionError) {
      return { ok: false, error: "This menu selection's kitchen stage can no longer be changed." };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
  revalidatePath("/kitchen-dashboard");
  revalidatePath("/kitchen-dashboard/delivered");
  revalidatePath("/kitchen-dashboard/cancelled");
  return { ok: true };
}
