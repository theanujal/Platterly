"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { InvalidKitchenRulesError, setKitchenRules } from "@/modules/kitchen/kitchen-rules";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateKitchenRulesAction(formData: FormData): Promise<ActionResult> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);
  try {
    await setKitchenRules(organizationId, {
      extraPercent: Number(formData.get("extraPercent")),
      daysBeforeEvent: Number(formData.get("daysBeforeEvent")),
    });
  } catch (error) {
    if (error instanceof InvalidKitchenRulesError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath("/settings/kitchen/kitchen-rules");
  revalidatePath("/kitchen-dashboard", "layout");
  return { ok: true };
}
