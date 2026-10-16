import type { MenuSelectionStatus } from "@/generated/prisma/enums";

// Pure helpers for the review components (moved unchanged from menu-approval-review.tsx).

export function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDateTime(date: Date) {
  return new Date(date).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// The team edits a menu only while no version of it is with the customer, approved or with the kitchen
// (mirrors EDITABLE_STATUSES in menu-approval.ts, which enforces it server-side).
export const EDITABLE_STATUSES: MenuSelectionStatus[] = ["DRAFT", "CHANGES_REQUESTED"];
export const WITH_CUSTOMER: MenuSelectionStatus[] = ["SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING"];

export const AUTHOR_LABEL = { CUSTOMER: "Customer", KITCHEN: "Kitchen", TEAM: "Team" } as const;
export const AUTHOR_TONE = { CUSTOMER: "info", KITCHEN: "warning", TEAM: "neutral" } as const;

/** The stage banner under the header: what is going on and what the team does next. */
export function stageBanner(status: MenuSelectionStatus, currentVersion: number, statusLabel: string) {
  switch (status) {
    case "CHANGES_REQUESTED":
      return {
        tone: "danger" as const,
        text: "The customer requested changes. Update the menu, then send a new version for approval.",
        noteLink: "View Customer Note",
      };
    // A Draft shows no banner: the header already says what the team does (AJ, 2026-10-16).
    case "SENT_TO_CUSTOMER":
    case "CUSTOMER_REVIEWING":
      return { tone: "info" as const, text: `Version ${currentVersion} is with the customer — ${statusLabel}`, noteLink: null };
    case "CUSTOMER_APPROVED":
      return {
        tone: "info" as const,
        text: `The customer approved version ${currentVersion}. Send it to the kitchen when everything is ready, or recall it to change something.`,
        noteLink: null,
      };
    default:
      return null;
  }
}

export const BANNER_CLASS = {
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-info/30 bg-info/10 text-info",
  neutral: "border-border bg-muted text-muted-foreground",
} as const;
