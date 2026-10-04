import "server-only";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { NOTICE_LIMITS, type PlatformNoticeInput } from "./notice-limits";

/**
 * The box at the bottom of every kitchen's sidebar. One row, edited by the Super Admin. Switched on, its text and
 * button replace the trial card for every kitchen; switched off, the trial card shows only during a trial.
 */
const ID = "platform";

export async function getPlatformNotice() {
  return prisma.platformNotice.upsert({ where: { id: ID }, create: { id: ID }, update: {} });
}

/** A button may open a page inside Platterly ("/subscribe") or a secure outside address; nothing else (no javascript: links). */
export function checkNoticeUrl(url: string) {
  if (!url) return;
  if (url.startsWith("/") && !url.startsWith("//")) return;
  try {
    if (new URL(url).protocol === "https:") return;
  } catch {
    // falls through to the error below
  }
  throw new ValidationError("The button link must start with / (a page in Platterly) or https://.");
}

export async function savePlatformNotice(input: PlatformNoticeInput) {
  const clean = (value: string) => value.trim() || null;
  const title = input.title.trim();
  const message = input.message.trim();
  const buttonLabel = input.buttonLabel.trim();
  const buttonUrl = input.buttonUrl.trim();
  for (const [key, max] of Object.entries(NOTICE_LIMITS)) {
    const value = { title, message, buttonLabel, buttonUrl }[key as keyof typeof NOTICE_LIMITS];
    if (value.length > max) throw new ValidationError(`${key === "buttonUrl" ? "Button link" : key === "buttonLabel" ? "Button label" : key[0].toUpperCase() + key.slice(1)} can be at most ${max} characters.`);
  }
  if (input.enabled && !title && !message) throw new ValidationError("Add a title or a message before switching the box on.");
  if (buttonLabel && !buttonUrl) throw new ValidationError("Add a link for the button, or clear its label.");
  if (buttonUrl && !buttonLabel) throw new ValidationError("Add a label for the button, or clear its link.");
  checkNoticeUrl(buttonUrl);
  const data = { enabled: input.enabled, title: clean(title), message: clean(message), buttonLabel: clean(buttonLabel), buttonUrl: clean(buttonUrl) };
  return prisma.platformNotice.upsert({ where: { id: ID }, create: { id: ID, ...data }, update: data });
}

/** What a kitchen sees: the custom box when it is on and has something to say, otherwise nothing (the trial card decides). */
export async function getActiveNotice() {
  const row = await getPlatformNotice();
  if (!row.enabled || (!row.title && !row.message)) return null;
  return { title: row.title, message: row.message, buttonLabel: row.buttonLabel, buttonUrl: row.buttonUrl };
}
