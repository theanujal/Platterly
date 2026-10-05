import "server-only";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { guardNotManagedByOps } from "@/modules/ops-link/guard";
import { opsBillingOn } from "@/modules/ops-link/config";
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

/** Checks and trims one notice. Shared by the Super Admin form and the ops `notice.set` command, so both obey the same limits. */
export function cleanNotice(input: PlatformNoticeInput) {
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
  return { enabled: input.enabled, title: clean(title), message: clean(message), buttonLabel: clean(buttonLabel), buttonUrl: clean(buttonUrl) };
}

export async function savePlatformNotice(input: PlatformNoticeInput) {
  guardNotManagedByOps("The sidebar notice and its message");
  const data = cleanNotice(input);
  return prisma.platformNotice.upsert({ where: { id: ID }, create: { id: ID, ...data }, update: data });
}

/** Stores the notice ops set for one business (the `notice.set` command). */
export async function saveOpsNotice(organizationId: string, businessId: string, input: PlatformNoticeInput) {
  const data = cleanNotice(input);
  return prisma.opsNotice.upsert({ where: { businessId }, create: { businessId, organizationId, ...data }, update: { organizationId, ...data } });
}

/**
 * What a kitchen sees: the custom box when it is on and has something to say, otherwise nothing (the trial card decides).
 * With OPS_BILLING on the notice is the one ops set for this business; otherwise the single Super Admin row.
 */
export async function getActiveNotice(organizationId?: string) {
  const row = opsBillingOn() && organizationId ? await prisma.opsNotice.findUnique({ where: { organizationId } }) : opsBillingOn() ? null : await getPlatformNotice();
  if (!row || !row.enabled || (!row.title && !row.message)) return null;
  return { title: row.title, message: row.message, buttonLabel: row.buttonLabel, buttonUrl: row.buttonUrl };
}
