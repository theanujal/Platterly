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
      tone: daysUntil <= IMMINENT_DAYS ? "yellow" : "success",
    };
  }
  if (daysUntil === 0) return { caption: "Event", label: "Today", tone: "orange" };
  if (utcDay(end) >= today) return { caption: "Event", label: "Ongoing", tone: "info" };
  return { caption: "Event", label: "Ended", tone: "neutral" };
}

/**
 * The countdown as the card shows it (AJ, 2026-09-27): always there for an
 * order that hasn't ended ("5 days", "1 day", "Today", "Ongoing"), so Starts in
 * is never missing even when the date cell already reads Today / Tomorrow. Only
 * "Ended" (and a cancelled order) drops out — AJ asked for that to disappear.
 */
export function getCardCountdown(start: Date, end: Date, orderStatus: OrderStatus, now: Date = new Date()): EventCountdown | null {
  const countdown = getEventCountdown(start, end, orderStatus, now);
  return countdown?.label === "Ended" ? null : countdown;
}

export interface MenuApprovalSummary {
  title: string;
  detail: string;
  tone: Tone;
}

// Same tone mapping as the Menu Approvals page's own status badges
// (menu-approvals/page.tsx), so a status never changes color between pages.
const MENU_APPROVAL_COPY: Record<MenuSelectionStatus, { title: string; detail: string; tone: Tone }> = {
  DRAFT: { title: "Needs review", detail: "Check the menu, then send it to the customer for approval.", tone: "cyan" },
  SENT_TO_CUSTOMER: { title: "Menu sent", detail: "Waiting for customer approval.", tone: "info" },
  CUSTOMER_REVIEWING: { title: "Updated menu sent", detail: "Waiting for the customer to review it.", tone: "info" },
  CHANGES_REQUESTED: { title: "Customer requested changes", detail: "Update the menu and send it again.", tone: "pink" },
  CUSTOMER_APPROVED: { title: "Customer approved the menu", detail: "Send it to the kitchen when everything is ready.", tone: "success" },
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
  if (order.paymentStatus === "UNPAID") return { label: "Unpaid", tone: "danger", summary: `${formatAmount(order.total)} pending` };
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

function formatDay(date: Date, withYear = true) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

/**
 * "26 Sept 2026", "5–6 Dec 2026" for a multi-day event within one month, else
 * "28 Nov – 2 Dec 2026".
 */
export function formatEventDates(start: Date, end: Date): string {
  if (start.toDateString() === end.toDateString()) return formatDay(start);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) return `${start.getDate()}–${formatDay(end)}`;
  return `${formatDay(start, false)} – ${formatDay(end)}`;
}

/**
 * "Today" / "Tomorrow" for an event starting then, otherwise the date(s) —
 * one value, never both (AJ, 2026-09-26). A multi-day event already under way
 * keeps its range, since "Today" would hide that it started earlier.
 */
export function formatEventWhen(start: Date, end: Date, now: Date = new Date()): string {
  const daysUntil = utcDay(start) - utcDay(now);
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return formatEventDates(start, end);
}

/**
 * The Venue / Building Name only (AJ, 2026-09-26) — never the full address,
 * which is too long for a card and has its own field on the Order.
 */
export function getOrderLocation(order: { venue: string | null }): string | null {
  return order.venue?.trim() || null;
}
