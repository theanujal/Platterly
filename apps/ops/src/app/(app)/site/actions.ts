"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { MediaError, deleteMedia, updateMediaAlt } from "@/modules/site-content/media";
import {
  SiteContentError, deleteSitePost, deleteSiteRelease, renameCategory, saveLegalPage, saveSiteContact, saveSiteNotice, saveSitePost, saveSiteRelease,
} from "@/modules/site-content/site-content";
import { SitePublishError, publishSite } from "@/modules/site-content/publish";

export interface SiteFormState {
  error?: string;
  saved?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

/** Runs a save; a validation message goes back to the form, anything else is a real error. */
async function run(done: string, work: (staffId: string) => Promise<unknown>, paths: string[]): Promise<SiteFormState> {
  const staff = await requireStaff();
  try {
    await work(staff.id);
  } catch (error) {
    if (error instanceof SiteContentError || error instanceof SitePublishError) return { error: error.message };
    throw error;
  }
  for (const path of paths) revalidatePath(path);
  return { saved: done };
}

export const saveNoticeAction = async (_prev: SiteFormState, f: FormData) =>
  run("Saved. Publish to put it on the site.", (id) => saveSiteNotice({ enabled: f.get("enabled") === "on", text: text(f, "text"), linkLabel: text(f, "linkLabel"), linkHref: text(f, "linkHref") }, id), ["/site", "/site/notice"]);

export const saveContactAction = async (_prev: SiteFormState, f: FormData) =>
  run("Saved. Publish to put it on the site.", (id) => saveSiteContact({ email: text(f, "email"), phone: text(f, "phone"), whatsapp: text(f, "whatsapp"), hours: text(f, "hours"), addressLines: text(f, "addressLines"), reply: text(f, "reply") }, id), ["/site", "/site/contact"]);

export const saveReleaseAction = async (_prev: SiteFormState, f: FormData) =>
  run("Saved. Publish to put it on the site.", (id) => saveSiteRelease({ id: text(f, "id"), date: text(f, "date"), title: text(f, "title"), body: text(f, "body"), kind: text(f, "kind") }, id), ["/site", "/site/releases"]);

export async function deleteReleaseAction(formData: FormData) {
  const staff = await requireStaff();
  await deleteSiteRelease(text(formData, "id"), staff.id);
  revalidatePath("/site/releases");
  revalidatePath("/site");
}

export const savePostAction = async (_prev: SiteFormState, f: FormData) =>
  run("Saved. Publish to put it on the site.", (id) => saveSitePost({ slug: text(f, "slug"), title: text(f, "title"), excerpt: text(f, "excerpt"), date: text(f, "date"), author: text(f, "author"), tags: text(f, "tags"), colourway: text(f, "colourway"), body: text(f, "body"), metaTitle: text(f, "metaTitle"), metaDescription: text(f, "metaDescription"), ogImage: text(f, "ogImage"), status: text(f, "status") || "PUBLISHED", publishAt: text(f, "publishAt") }, id), ["/site", "/site/posts"]);

export async function deletePostAction(formData: FormData) {
  const staff = await requireStaff();
  await deleteSitePost(text(formData, "slug"), staff.id);
  revalidatePath("/site/posts");
  revalidatePath("/site");
  redirect("/site/posts");
}

export const renameCategoryAction = async (_prev: SiteFormState, f: FormData) => {
  const staff = await requireStaff();
  try {
    const count = await renameCategory(text(f, "from"), text(f, "to"), staff.id);
    revalidatePath("/site/posts");
    return { saved: `Updated ${count} post${count === 1 ? "" : "s"}. Publish to put it on the site.` };
  } catch (error) {
    if (error instanceof SiteContentError) return { error: error.message };
    throw error;
  }
};

export const saveLegalAction = async (_prev: SiteFormState, f: FormData) =>
  run("Saved. Publish to put it on the site.", (id) => saveLegalPage({ slug: text(f, "slug"), title: text(f, "title"), summary: text(f, "summary"), updated: text(f, "updated"), body: text(f, "body") }, id), ["/site", "/site/pages"]);

export const publishSiteAction = async (): Promise<SiteFormState> => {
  const staff = await requireStaff();
  try {
    await publishSite(staff.id);
  } catch (error) {
    if (error instanceof SitePublishError) return { error: error.message };
    throw error;
  }
  revalidatePath("/site");
  return { saved: "Publish started. The site rebuilds in a minute or two; this page shows when it finishes." };
};

export const saveAltAction = async (_prev: SiteFormState, f: FormData): Promise<SiteFormState> => {
  const staff = await requireStaff();
  try {
    await updateMediaAlt(text(f, "name"), text(f, "alt"), staff.id);
  } catch (error) {
    if (error instanceof MediaError) return { error: error.message };
    throw error;
  }
  revalidatePath("/site/media");
  return { saved: "Saved." };
};

export async function deleteMediaAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  try {
    await deleteMedia(text(formData, "name"), staff.id);
  } catch (error) {
    if (!(error instanceof MediaError)) throw error;
  }
  revalidatePath("/site/media");
}
