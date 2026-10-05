"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { acknowledgeAlert } from "@/modules/alerts/alerts";

export async function acknowledgeAlertAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  await acknowledgeAlert(String(formData.get("id") ?? ""), staff.id);
  revalidatePath("/alerts");
}
