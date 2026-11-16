"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { LifecycleError } from "@/modules/lifecycle/lifecycle";
import { approveAccountDeletion, declineAccountDeletion, requestAccountErasure, restoreAccountDeletion } from "@/modules/account-deletions/account-deletions";

export type DeletionFormState = { error?: string; done?: string };

async function run(work: () => Promise<void>, done: string): Promise<DeletionFormState> {
  try {
    await work();
  } catch (error) {
    if (error instanceof LifecycleError) return { error: error.message };
    console.error("[account-deletions] action failed", error);
    return { error: "Something went wrong. Nothing was changed." };
  }
  revalidatePath("/account-deletions");
  return { done };
}

export async function approveDeletionAction(_prev: DeletionFormState, formData: FormData): Promise<DeletionFormState> {
  const staff = await requireStaff();
  return run(() => approveAccountDeletion(String(formData.get("id") ?? ""), staff.id), "Approved. The business is suspended and the person is told.");
}

export async function declineDeletionAction(_prev: DeletionFormState, formData: FormData): Promise<DeletionFormState> {
  const staff = await requireStaff();
  return run(() => declineAccountDeletion(String(formData.get("id") ?? ""), String(formData.get("reason") ?? ""), staff.id), "Declined. The person is told why.");
}

export async function restoreDeletionAction(_prev: DeletionFormState, formData: FormData): Promise<DeletionFormState> {
  const staff = await requireStaff();
  return run(() => restoreAccountDeletion(String(formData.get("id") ?? ""), staff.id), "Restored. The business and the account are released.");
}

export async function eraseDeletionAction(_prev: DeletionFormState, formData: FormData): Promise<DeletionFormState> {
  const staff = await requireStaff();
  return run(() => requestAccountErasure(String(formData.get("id") ?? ""), String(formData.get("confirmation") ?? ""), staff.id), "Erase started. The products are erasing the business and the Platform will remove the person the next time it checks.");
}
