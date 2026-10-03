"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-session";
import { markAllRead, markRead } from "@/modules/notifications/inbox";

// The Super Admin bell: platform alerts (a new caterer signed up...) kept per person, across all kitchens.
export async function markPlatformNotificationReadAction(id: string): Promise<void> {
  const session = await requireSuperAdmin();
  await markRead(null, session.user.id, id);
  revalidatePath("/super", "layout");
}

export async function markAllPlatformNotificationsReadAction(): Promise<void> {
  const session = await requireSuperAdmin();
  await markAllRead(null, session.user.id);
  revalidatePath("/super", "layout");
}
