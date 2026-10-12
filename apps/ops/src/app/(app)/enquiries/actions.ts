"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { EnquiryError, updateEnquiry } from "@/modules/enquiries/enquiries";

export interface EnquiryFormState {
  error?: string;
  saved?: boolean;
}

/** Moves a lead (New, Contacted, Closed) and keeps a note. */
export async function updateEnquiryAction(_prev: EnquiryFormState, formData: FormData): Promise<EnquiryFormState> {
  const staff = await requireStaff();
  const status = String(formData.get("status") ?? "");
  if (status !== "NEW" && status !== "CONTACTED" && status !== "CLOSED") return { error: "Choose a status." };
  try {
    await updateEnquiry(String(formData.get("id") ?? ""), { status, note: String(formData.get("note") ?? "") || null }, staff.id);
    revalidatePath("/enquiries");
    return { saved: true };
  } catch (error) {
    if (error instanceof EnquiryError) return { error: error.message };
    throw error;
  }
}
