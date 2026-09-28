// Client-safe (no "server-only", no Prisma) — imported by both the public
// storefront wizard and the admin "Abandoned Orders" list.

/** A draft idle this long counts as abandoned (AJ, 2026-09-25). Derived at read time — no cron. */
export const ABANDONED_AFTER_MS = 30 * 60 * 1000;

/**
 * A draft idle this long (AJ, 2026-09-28) has its resume link expire — the
 * customer's link shows "This link has expired" instead of resuming, and the
 * admin card drops WhatsApp/Copy Link for a "Link expired" note. The record
 * itself is kept (no auto-delete); this only gates the link and the actions.
 */
export const DRAFT_EXPIRY_DAYS = 30;

/** Whether a draft's resume link has lapsed. Shared by the public wizard and the admin Abandoned Orders list, so neither can disagree on the cutoff. */
export function isDraftExpired(lastActivityAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - lastActivityAt.getTime() > DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}

/** A draft idle this long (AJ, 2026-09-28, "purge after 3 months") is hard-deleted — well past DRAFT_EXPIRY_DAYS, so it's already long expired and never resurfaced. The Customer (a Lead with 0 orders) stays. */
export const DRAFT_PURGE_DAYS = 90;

/** The wizard's steps, in order. `currentStep` on a draft is the 1-based index of the step the visitor is on. */
export const WIZARD_STEPS = [
  { key: "details", label: "Event Details" },
  { key: "menu", label: "Choose Menu" },
  { key: "items", label: "Choose Items" },
  { key: "venue", label: "Venue & Delivery" },
  { key: "review", label: "Review & Submit" },
] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number]["key"];

export function stepLabel(currentStep: number): string {
  return WIZARD_STEPS[Math.min(Math.max(currentStep, 1), WIZARD_STEPS.length) - 1].label;
}

/**
 * Whether new visitors' "keep me updated on WhatsApp, incl. offers" box starts
 * ticked. AJ asked for ticked-by-default (2026-09-25). Note for whoever flips
 * it: India's DPDP Act asks for a clear affirmative action, which a pre-ticked
 * box arguably isn't — this is the one switch to change if that advice lands.
 */
export const MARKETING_CONSENT_DEFAULT_CHECKED = true;
