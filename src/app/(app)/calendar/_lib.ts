import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type { OrderStatus } from "@/generated/prisma/enums";

const DAY_MS = 86_400_000;

/** Pure UTC "YYYY-MM-DD" arithmetic — matches how Order/Event dates are stored (UTC midnight). */
export function addDays(iso: string, n: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

export function addMonths(monthKey: string, n: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Today's calendar day on the server's clock, as "YYYY-MM-DD" (local getters, not toISOString — see dashboard/_data.ts's dateKey). */
export function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function parseMonthParam(raw: string | undefined, today: string): string {
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : today.slice(0, 7);
}

export function monthLabel(monthKey: string): string {
  return new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
}

/** The 42 (6 weeks x 7) "YYYY-MM-DD" cells shown for a month, Sunday-first, including adjacent-month days. */
export function monthGrid(monthKey: string): string[] {
  const first = `${monthKey}-01`;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const start = addDays(first, -weekday);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  IN_PREPARATION: "In Preparation",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

// Shared neutral/info/warning/success/danger legend — same mapping as orders/page.tsx.
export const ORDER_STATUS_VARIANT: Record<OrderStatus, NonNullable<VariantProps<typeof badgeVariants>["variant"]>> = {
  DRAFT: "neutral",
  CONFIRMED: "info",
  IN_PREPARATION: "info",
  READY: "success",
  COMPLETED: "success",
  CANCELLED: "danger",
};

export function coversDay(startDate: string, endDate: string, day: string): boolean {
  return startDate <= day && day <= endDate;
}
