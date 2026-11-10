"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { NewsletterError, createIssue, deleteIssue, requestTest, saveIssue, scheduleIssue, unscheduleIssue } from "@/modules/newsletter/newsletter";

export type NewsletterFormState = { error?: string; saved?: string };
const text = (f: FormData, key: string) => String(f.get(key) ?? "");

async function run(done: string, work: (staffId: string) => Promise<void>, id: string): Promise<NewsletterFormState> {
  const staff = await requireStaff();
  try {
    await work(staff.id);
  } catch (error) {
    if (error instanceof NewsletterError) return { error: error.message };
    throw error;
  }
  revalidatePath("/newsletter");
  revalidatePath(`/newsletter/${id}`);
  return { saved: done };
}

export async function newIssueAction(): Promise<void> {
  const staff = await requireStaff();
  const id = await createIssue(staff.id);
  revalidatePath("/newsletter");
  redirect(`/newsletter/${id}`);
}

export const saveIssueAction = async (_prev: NewsletterFormState, f: FormData) =>
  run("Saved.", (staffId) => saveIssue(text(f, "id"), { subject: text(f, "subject"), body: text(f, "body") }, staffId), text(f, "id"));

/** Saves what is on the screen, then asks the Platform to mail a test to the signed-in staff member the next time it checks in. */
export const sendTestAction = async (_prev: NewsletterFormState, f: FormData) => {
  const staff = await requireStaff();
  return run("Saved. A test email goes to " + staff.email + " the next time the Platform checks in (within a few minutes).", async (staffId) => {
    await saveIssue(text(f, "id"), { subject: text(f, "subject"), body: text(f, "body") }, staffId);
    await requestTest(text(f, "id"), staff.email, staffId);
  }, text(f, "id"));
};

/** `sendAt` is a date and time in India time, as the browser's picker writes it. It schedules the text as last saved. */
export const scheduleIssueAction = async (_prev: NewsletterFormState, f: FormData) => {
  const raw = text(f, "sendAt").trim();
  const when = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? new Date(`${raw}:00+05:30`) : new Date(Number.NaN);
  return run("Scheduled. It goes out at that time.", async (staffId) => {
    await scheduleIssue(text(f, "id"), when, staffId); // the text as last saved
  }, text(f, "id"));
};

export async function unscheduleIssueAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const id = text(formData, "id");
  await unscheduleIssue(id, staff.id).catch((error) => { if (!(error instanceof NewsletterError)) throw error; });
  revalidatePath("/newsletter");
  revalidatePath(`/newsletter/${id}`);
}

export async function deleteIssueAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  await deleteIssue(text(formData, "id"), staff.id).catch((error) => { if (!(error instanceof NewsletterError)) throw error; });
  revalidatePath("/newsletter");
  redirect("/newsletter");
}
