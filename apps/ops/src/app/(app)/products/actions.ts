"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { MediaError, storeMedia } from "@/modules/site-content/media";
import { ProductCardError, deleteUpcoming, saveLiveCard, saveUpcoming } from "@/modules/product-cards/manage";

export interface CardFormState {
  error?: string;
  saved?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

/** The picture the form chose: keep what it had, none, a built-in one, one from the library, or a new upload (stored first). */
async function chosenImage(form: FormData, staffId: string): Promise<string | null> {
  switch (text(form, "imageMode")) {
    case "none":
      return null;
    case "builtin":
      return `builtin:${text(form, "imageBuiltin")}`;
    case "library":
      return `upload:${text(form, "imageLibrary")}`;
    case "upload": {
      const file = form.get("imageFile");
      if (!(file instanceof File) || file.size === 0) throw new ProductCardError("Choose a picture to upload.");
      return `upload:${(await storeMedia(new Uint8Array(await file.arrayBuffer()), file.name, staffId)).name}`;
    }
    default:
      return text(form, "imageCurrent") || null;
  }
}

/** The logo the form chose: keep, none, one from the library, or a new upload. Always an upload, never a built-in picture. */
async function chosenLogo(form: FormData, staffId: string): Promise<string | null> {
  switch (text(form, "logoMode")) {
    case "none":
      return null;
    case "library":
      return `upload:${text(form, "logoLibrary")}`;
    case "upload": {
      const file = form.get("logoFile");
      if (!(file instanceof File) || file.size === 0) throw new ProductCardError("Choose a logo to upload.");
      return `upload:${(await storeMedia(new Uint8Array(await file.arrayBuffer()), file.name, staffId)).name}`;
    }
    default:
      return text(form, "logoCurrent") || null;
  }
}

/** The four feature rows of the form (`featureIcon0`, `featureTitle0`, `featureText0` ...). Empty rows are dropped by the server. */
function featureRows(form: FormData) {
  return [0, 1, 2, 3].map((i) => ({ icon: text(form, `featureIcon${i}`), title: text(form, `featureTitle${i}`), text: text(form, `featureText${i}`) }));
}

/** The launch time is typed as India time (`2026-12-01T09:00`); Ops runs in UTC, so the offset is explicit. */
function parseLaunch(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value.length === 16 ? `${value}:00+05:30` : `${value}+05:30`);
  if (Number.isNaN(date.getTime())) throw new ProductCardError("The launch date is not a date.");
  return date;
}

async function guarded(run: (staffId: string) => Promise<string>): Promise<CardFormState> {
  const staff = await requireStaff();
  try {
    const saved = await run(staff.id);
    revalidatePath("/products");
    return { saved };
  } catch (error) {
    if (error instanceof ProductCardError || error instanceof MediaError) return { error: error.message };
    throw error;
  }
}

export async function saveLiveCardAction(_prev: CardFormState, form: FormData): Promise<CardFormState> {
  return guarded(async (staffId) => {
    await saveLiveCard(staffId, text(form, "key"), { tagline: text(form, "tagline"), cardImage: await chosenImage(form, staffId), logo: await chosenLogo(form, staffId), about: text(form, "about"), features: featureRows(form) });
    return "Saved.";
  });
}

export async function saveUpcomingAction(_prev: CardFormState, form: FormData): Promise<CardFormState> {
  return guarded(async (staffId) => {
    const create = text(form, "mode") === "create";
    await saveUpcoming(
      staffId,
      {
        key: text(form, "key"),
        name: text(form, "name"),
        tagline: text(form, "tagline"),
        cardImage: await chosenImage(form, staffId),
        logo: await chosenLogo(form, staffId),
        launchAt: parseLaunch(text(form, "launchAt")),
        sortOrder: Number(text(form, "sortOrder") || "0"),
        upcoming: form.get("upcoming") === "on",
        visible: form.get("visible") === "on",
      },
      create,
    );
    return create ? "Added." : "Saved.";
  });
}

export async function deleteUpcomingAction(_prev: CardFormState, form: FormData): Promise<CardFormState> {
  return guarded(async (staffId) => {
    await deleteUpcoming(staffId, text(form, "key"));
    return "Deleted.";
  });
}
