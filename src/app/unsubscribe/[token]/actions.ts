"use server";

import { revalidatePath } from "next/cache";
import { customerIdFromUnsubscribeToken } from "@/lib/notifications/unsubscribe";
import { setMarketingOptOut } from "@/modules/notifications/opt-out";

/** The public unsubscribe link. The signed token is the only credential: a forged one changes nothing. */
export async function setPromotionalOptOutAction(token: string, optedOut: boolean): Promise<{ ok: boolean }> {
  const customerId = customerIdFromUnsubscribeToken(token);
  if (!customerId) return { ok: false };
  await setMarketingOptOut(customerId, optedOut === true);
  revalidatePath(`/unsubscribe/${token}`);
  return { ok: true };
}
