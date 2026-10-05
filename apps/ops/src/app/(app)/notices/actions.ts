"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { NoticeError, publishNotice } from "@/modules/notices/notices";

export interface NoticeFormState {
  error?: string;
  saved?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function publishNoticeAction(_prev: NoticeFormState, formData: FormData): Promise<NoticeFormState> {
  const staff = await requireStaff();
  try {
    const { queued, businesses } = await publishNotice(text(formData, "productKey"), {
      enabled: formData.get("enabled") === "on",
      title: text(formData, "title"),
      message: text(formData, "message"),
      buttonLabel: text(formData, "buttonLabel"),
      buttonUrl: text(formData, "buttonUrl"),
    }, staff.id);
    revalidatePath("/notices");
    return { saved: `Saved and sent to ${queued} of ${businesses} business${businesses === 1 ? "" : "es"}. Delivery is shown below.` };
  } catch (error) {
    if (error instanceof NoticeError) return { error: error.message };
    throw error;
  }
}
