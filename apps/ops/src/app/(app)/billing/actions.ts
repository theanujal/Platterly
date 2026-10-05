"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { ProfileError, saveProfile, type ProfileInput } from "@/modules/billing/profile";

export interface ProfileFormState {
  error?: string;
  saved?: boolean;
}

const FIELDS: (keyof ProfileInput)[] = ["legalName", "addressLine1", "addressLine2", "city", "state", "stateCode", "postalCode", "country", "gstin", "pan", "sacCode", "invoicePrefix", "email", "phone", "website", "invoiceNote"];

export async function saveProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const staff = await requireStaff();
  const input = Object.fromEntries(FIELDS.map((f) => [f, String(formData.get(f) ?? "")])) as unknown as ProfileInput;
  try {
    await saveProfile(input, staff.id);
    revalidatePath("/billing");
    return { saved: true };
  } catch (error) {
    if (error instanceof ProfileError) return { error: error.message };
    throw error;
  }
}
