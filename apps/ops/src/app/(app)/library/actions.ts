"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { LibraryReviewError, decideCandidate } from "@/modules/library/library";

export interface ReviewState {
  error?: string;
  done?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

/** One reviewer answer for one candidate: approve (with any corrections), merge into the suggested library item, or reject. */
export async function reviewAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const staff = await requireStaff();
  const id = text(formData, "id");
  const intent = text(formData, "intent");
  try {
    if (intent === "reject") {
      await decideCandidate(id, { action: "reject" }, staff.id);
    } else if (intent === "merge") {
      const mergeIntoId = text(formData, "mergeIntoId");
      if (!mergeIntoId) return { error: "There is no library item to merge into." };
      await decideCandidate(id, { action: "merge", mergeIntoId }, staff.id);
    } else if (intent === "approve") {
      const foodType = text(formData, "foodType");
      await decideCandidate(
        id,
        {
          action: "approve",
          entry: {
            name: text(formData, "name"),
            categoryName: text(formData, "categoryName"),
            foodType: foodType === "VEGETARIAN" || foodType === "NON_VEGETARIAN" ? foodType : null,
            unit: text(formData, "unit") || null,
            description: text(formData, "description") || null,
          },
        },
        staff.id,
      );
    } else {
      return { error: "Choose Approve, Merge or Reject." };
    }
  } catch (error) {
    if (error instanceof LibraryReviewError) return { error: error.message };
    console.error("[library review]", error);
    return { error: "Something went wrong. Nothing was changed." };
  }
  revalidatePath("/library");
  return { done: "Saved." };
}
