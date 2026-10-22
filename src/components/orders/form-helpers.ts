import { toLocalIsoDate } from "@/lib/time/local-date";

/** Small helpers shared by the Create Order and Quotation forms (issue 73). */

// Mirrors actions.ts's own past-date check — a live client-side preview of the
// same server-enforced rule, never the only place it's checked. The team may
// book today and tomorrow; only a date already gone is refused (AJ, 2026-09-27).
export function daysUntilPreview(iso: string): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const eventDate = new Date(y, m - 1, d);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((eventDate.getTime() - startOfToday.getTime()) / 86_400_000);
}

/** "Starts in" wording for the event-date chip and the summary — same tones as the Orders card's countdown. */
export function startsInPreview(days: number | null): { caption: string; label: string; tone: "orange" | "yellow" | "success" } | null {
  if (days === null || days < 0) return null;
  if (days === 0) return { caption: "Event", label: "Today", tone: "orange" };
  return { caption: "Starts in", label: `${days} ${days === 1 ? "day" : "days"}`, tone: days <= 2 ? "yellow" : "success" };
}

export function enumerateDates(start: string, end: string): string[] {
  if (!start || !end) return [];
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return [];
  const dates: string[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(toLocalIsoDate(d));
  }
  return dates;
}

/** One typed charge line as the shared parser reads it: a percentage line carries its rate, a rupee line its amount. */
export function customChargeInput(c: { label: string; amount: string; mode: "FIXED" | "PERCENTAGE" }) {
  const typed = Number.parseFloat(c.amount);
  return c.mode === "PERCENTAGE" ? { label: c.label, mode: c.mode, rate: typed, amount: 0 } : { label: c.label, amount: typed };
}
