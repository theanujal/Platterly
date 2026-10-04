"use server";

import { revalidatePath } from "next/cache";
import { userMessage } from "@/lib/errors";
import { requireSuperAdmin } from "@/lib/auth/require-session";
import { savePlatformBillingProfile, type PlatformBillingInput } from "@/modules/subscriptions/platform-billing";

export async function saveBillingProfileAction(input: PlatformBillingInput): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  try {
    await savePlatformBillingProfile(input);
  } catch (error) {
    return { ok: false, error: userMessage(error, "Could not save.") };
  }
  revalidatePath("/super/billing");
  return { ok: true };
}
