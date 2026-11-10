"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { clearAccountReview } from "@/modules/account-reviews/account-reviews";

/** Staff have checked the person is who they say. The Platform lifts the hold the next time that person signs in. */
export async function clearAccountReviewAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  await clearAccountReview(String(formData.get("id") ?? ""), staff.id);
  revalidatePath("/account-reviews");
}
