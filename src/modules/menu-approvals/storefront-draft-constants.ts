// Client-safe (no "server-only", no Prisma) — imported by both the public
// storefront wizard and the admin "Abandoned Orders" list.

/** A draft idle this long counts as abandoned (AJ, 2026-09-25). Derived at read time — no cron. */
export const ABANDONED_AFTER_MS = 30 * 60 * 1000;

/** Drafts older than this are purged; the Customer (a Lead with 0 orders) stays. */
export const DRAFT_RETENTION_DAYS = 90;

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
