"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { LibraryReviewError, decideCandidate, findEntryByName, updateLibraryEntry } from "@/modules/library/library";

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
    } else if (intent === "mergeOther") {
      // Any library item, chosen by typing its name (the suggestion is only a shortcut).
      const target = await findEntryByName(id, text(formData, "mergeIntoName"));
      await decideCandidate(id, { action: "merge", mergeIntoId: target.id }, staff.id);
    } else if (intent === "approvePhoto") {
      if (text(formData, "checked") !== "yes") return { error: "Tick the box to confirm the photo is good and fine to share with every kitchen." };
      await decideCandidate(id, { action: "approve" }, staff.id);
    } else if (intent === "approve") {
      const foodType = text(formData, "foodType");
      await decideCandidate(
        id,
        {
          action: "approve",
          entry: {
            name: text(formData, "name"),
            categoryName: text(formData, "categoryName") || text(formData, "name"), // a category's own name is its category
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

/** Undo of a decision made by mistake: the item goes back to Pending here and in the product (an approval's library entry is removed). */
export async function undoAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const back = text(formData, "back");
  const to = back.startsWith("/library?") ? back : "/library?";
  let error = "";
  try {
    await decideCandidate(text(formData, "id"), { action: "reopen" }, staff.id);
  } catch (e) {
    if (!(e instanceof LibraryReviewError)) throw e;
    error = e.message;
  }
  revalidatePath("/library");
  if (error) redirect(`${to}&undoError=${encodeURIComponent(error)}`);
}

/** One change to a library entry (edit its fields, or hide / show it). Kitchens' own copies never change. */
export async function entryAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const staff = await requireStaff();
  const productKey = text(formData, "productKey");
  const id = text(formData, "id");
  const kind = text(formData, "kind");
  const intent = text(formData, "intent");
  if (kind !== "FOOD_ITEM" && kind !== "INGREDIENT" && kind !== "CATEGORY") return { error: "Unknown kind." };
  try {
    if (intent === "hide" || intent === "show") {
      await updateLibraryEntry(productKey, { id, kind, isActive: intent === "show" }, staff.id, text(formData, "label"));
    } else {
      const foodType = text(formData, "foodType");
      const aliases = text(formData, "aliases").split(",").map((a) => a.trim()).filter(Boolean);
      await updateLibraryEntry(
        productKey,
        kind === "CATEGORY"
          ? { id, kind, name: text(formData, "name"), aliases }
          : {
              id,
              kind,
              name: text(formData, "name"),
              categoryName: text(formData, "categoryName"),
              description: text(formData, "description") || null,
              aliases,
              ...(kind === "FOOD_ITEM" && (foodType === "VEGETARIAN" || foodType === "NON_VEGETARIAN") ? { foodType } : {}),
              ...(kind === "INGREDIENT" && text(formData, "unit") ? { unit: text(formData, "unit") } : {}),
            },
        staff.id,
        text(formData, "label"),
      );
    }
  } catch (error) {
    if (error instanceof LibraryReviewError) return { error: error.message };
    console.error("[library entry]", error);
    return { error: "Something went wrong. Nothing was changed." };
  }
  revalidatePath("/library/entries");
  return { done: "Saved." };
}
