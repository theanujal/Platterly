"use server";

import { revalidatePath } from "next/cache";
import { userMessage } from "@/lib/errors";
import { requireSuperAdmin } from "@/lib/auth/require-session";
import { savePlatformNotice } from "@/modules/subscriptions/platform-notice";
import type { PlatformNoticeInput } from "@/modules/subscriptions/notice-limits";

export async function saveNoticeAction(input: PlatformNoticeInput): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  try {
    await savePlatformNotice(input);
  } catch (error) {
    return { ok: false, error: userMessage(error, "Could not save.") };
  }
  // Every kitchen's layout shows it.
  revalidatePath("/", "layout");
  return { ok: true };
}
