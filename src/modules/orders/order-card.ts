import type { MenuSelectionStatus, OrderPaymentStatus, OrderStatus } from "@/generated/prisma/enums";
import type { Tone } from "./order-status";

/**
 * Orders card (AJ, 2026-09-26) — the derived, display-only values the card
 * shows on top of the raw Order row. Pure and not "server-only"-guarded, so
 * the rules are unit-testable without a DB and can't drift from what's
 * rendered.
 *
 * Tones are the shared Badge legend (see Tone in order-status.ts).
 */
const INR_WHOLE = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const INR_FRACTIONAL = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Indian digit grouping, paise only when there are some: ₹60,000 but ₹1,21,558.14. */
export function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? INR_WHOLE.format(amount) : INR_FRACTIONAL.format(amount);
}

/** Always two decimals with Indian grouping (₹64,440.00) — the list view's Total column, where amounts line up in a column. */
export function formatAmountExact(amount: number): string {
  return INR_FRACTIONAL.format(amount);
}

export type { Tone };

const DAY_MS = 86_400_000;

/** Order/Event dates are stored as UTC midnight (see calendar.ts), so compare UTC days. */
function utcDay(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
}

export interface EventCountdown {
  /** Small label above the value — "Starts in" only while the event is still ahead. */
  caption: string;
  label: string;
  tone: Tone;
}

/** Within this many days an upcoming event turns from success to warning. */
const IMMINENT_DAYS = 2;

export function getEventCountdown(start: Date, end: Date, orderStatus: OrderStatus, now: Date = new Date()): EventCountdown | null {
  if (orderStatus === "CANCELLED") return null;
  const today = utcDay(now);
  const daysUntil = utcDay(start) - today;

  if (daysUntil > 0) {
    return {
      caption: "Starts in",
      label: `${daysUntil} ${daysUntil === 1 ? "day" : "days"}`,
      tone: daysUntil <= IMMINENT_DAYS ? "warning" : "success",
    };
  }
  if (daysUntil === 0) return { caption: "Event", label: "Today", tone: "warning" };
  if (utcDay(end) >= today) return { caption: "Event", label: "Ongoing", tone: "info" };
  return { caption: "Event", label: "Ended", tone: "neutral" };
}

export interface MenuApprovalSummary {
  title: string;
  detail: string;
  tone: Tone;
}

// Same tone mapping as the Menu Approvals page's own status badges
// (menu-approvals/page.tsx), so a status never changes color between pages.
const MENU_APPROVAL_COPY: Record<MenuSelectionStatus, { title: string; detail: string; tone: Tone }> = {
  DRAFT: { title: "Needs review", detail: "Check the menu, then send it to the customer for approval.", tone: "warning" },
  SENT_TO_CUSTOMER: { title: "Menu sent", detail: "Waiting for customer approval.", tone: "info" },
  CUSTOMER_REVIEWING: { title: "Customer is reviewing", detail: "Waiting for their approval.", tone: "info" },
  CHANGES_REQUESTED: { title: "Customer requested changes", detail: "Update the menu and send it again.", tone: "warning" },
  CUSTOMER_APPROVED: { title: "Customer approved the menu", detail: "Waiting for the kitchen team to review.", tone: "success" },
  KITCHEN_REVIEWING: { title: "Kitchen is reviewing", detail: "Waiting for the kitchen team to approve.", tone: "info" },
  KITCHEN_CHANGES_REQUESTED: { title: "Kitchen requested changes", detail: "Update the menu and send it to the customer again.", tone: "warning" },
  KITCHEN_APPROVED: { title: "Kitchen approved the menu", detail: "Sending it to the kitchen.", tone: "success" },
  FINAL_LOCKED: { title: "Sent to the kitchen", detail: "The menu is final.", tone: "success" },
};

// Workflow order (schema enum order = progress order). An Order can own
// several Events, each with its own MenuSelection; the card surfaces the
// least-advanced one, since that's the one still needing somebody's attention.
const MENU_APPROVAL_ORDER: MenuSelectionStatus[] = [
  "DRAFT",
  "SENT_TO_CUSTOMER",
  "CUSTOMER_REVIEWING",
  "CHANGES_REQUESTED",
  "CUSTOMER_APPROVED",
  "KITCHEN_REVIEWING",
  "KITCHEN_CHANGES_REQUESTED",
  "KITCHEN_APPROVED",
  "FINAL_LOCKED",
];

export function summarizeMenuApproval(
  selections: { status: MenuSelectionStatus; currentVersion: number }[],
  orderStatus: OrderStatus,
): MenuApprovalSummary | null {
  // A finished or cancelled order has no approval left to wait on.
  if (selections.length === 0 || orderStatus === "CANCELLED" || orderStatus === "COMPLETED") return null;

  const current = selections.reduce((least, s) =>
    MENU_APPROVAL_ORDER.indexOf(s.status) < MENU_APPROVAL_ORDER.indexOf(least.status) ? s : least,
  );
  const copy = MENU_APPROVAL_COPY[current.status];
  // currentVersion only bumps when an already-approved menu is changed, so a
  // re-sent menu (version > 1) is a revision, not the first send.
  if (current.status === "SENT_TO_CUSTOMER" && current.currentVersion > 1) return { ...copy, title: "Revised menu sent" };
  return copy;
}

export interface PaymentBreakdown {
  label: string;
  tone: Tone;
  /** One line under the badge, e.g. "₹60,000 paid · ₹61,558.14 pending". */
  summary: string;
}

/**
 * `advance` is only the amount collected while PARTIALLY_PAID — a PAID order
 * may still carry advance 0 (order-form.tsx only requires Advance for
 * Partially Paid), so PAID is treated as fully collected rather than trusting
 * `total - advance`.
 */
export function getPaymentBreakdown(order: { total: number; advance: number; paymentStatus: OrderPaymentStatus }): PaymentBreakdown {
  if (order.paymentStatus === "PAID") return { label: "Paid", tone: "success", summary: "Paid in full" };
  if (order.paymentStatus === "UNPAID") return { label: "Unpaid", tone: "warning", summary: `${formatAmount(order.total)} pending` };
  const paid = Math.min(order.advance, order.total);
  const pending = Math.max(order.total - paid, 0);
  return { label: "Partially Paid", tone: "info", summary: `${formatAmount(paid)} paid · ${formatAmount(pending)} pending` };
}

/** Guests shown on the card: the explicit total, else the sum of the age-band counts, else null. */
export function getGuestCount(order: {
  totalParticipants: number | null;
  adultCount: number | null;
  childBelow5Count: number | null;
  child5To10Count: number | null;
}): number | null {
  if (order.totalParticipants) return order.totalParticipants;
  const sum = (order.adultCount ?? 0) + (order.childBelow5Count ?? 0) + (order.child5To10Count ?? 0);
  return sum > 0 ? sum : null;
}

function formatDay(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** "26 Sept 2026", or "5 Dec – 6 Dec 2026" for a multi-day event. */
export function formatEventDates(start: Date, end: Date): string {
  if (start.toDateString() === end.toDateString()) return formatDay(start);
  return `${start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${formatDay(end)}`;
}

/** Where the event is: the venue name, else the address, else nothing. */
export function getOrderLocation(order: { venue: string | null; eventAddress: string | null }): string | null {
  return order.venue?.trim() || order.eventAddress?.trim() || null;
}

/** Countdown wording for a single-line pill ("In 17 days", "Today", "Ongoing"), as used in the list view. */
export function countdownPillLabel(countdown: EventCountdown): string {
  return countdown.caption === "Starts in" ? `In ${countdown.label}` : countdown.label;
}
