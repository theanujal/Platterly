"use server";

import { revalidatePath } from "next/cache";
import { getSelectedProduct } from "@/lib/selected-product";
import { requireStaff } from "@/lib/session";
import { markAllRead, markRead } from "@/modules/notifications/notifications";

export async function markReadAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  await markRead(String(formData.get("id") ?? ""), staff.id);
  revalidatePath("/", "layout");
}

/** Marks everything in view as read: the picked product's, or all of them under "All products". */
export async function markAllReadAction(): Promise<void> {
  const staff = await requireStaff();
  await markAllRead(staff.id, (await getSelectedProduct())?.key);
  revalidatePath("/", "layout");
}
