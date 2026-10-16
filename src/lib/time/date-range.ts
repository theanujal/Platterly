import { DEFAULT_TIME_ZONE, isValidTimeZone } from "./timezone";

/**
 * The dashboard's date range (AJ, 2026-10-14). Dates travel as plain "YYYY-MM-DD" calendar days (both ends included) and
 * are turned into instants in the kitchen's own time zone only where a query needs them. No server-only imports: the
 * date picker uses the presets in the browser too.
 */
export interface DateRange {
  from: string;
  to: string;
}

/** A longer range would pull a huge number of orders into one chart. */
export const MAX_RANGE_DAYS = 400;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function utcMidnight(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function isoOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO.test(value)) return false;
  return isoOf(utcMidnight(value)) === value; // rejects 2026-02-31
}

export function addDaysIso(iso: string, days: number): string {
  return isoOf(utcMidnight(iso) + days * DAY_MS);
}

/** Days from `from` to `to`, both included. */
export function daysInRange(range: DateRange): number {
  return Math.round((utcMidnight(range.to) - utcMidnight(range.from)) / DAY_MS) + 1;
}

/** The calendar day of an instant in a time zone, as "YYYY-MM-DD". */
export function dayKeyInZone(date: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function zoneOffsetMs(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour"), pick("minute"), pick("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant a calendar day starts in a time zone (for timestamps like `createdAt`; event dates are UTC midnight of the day). */
export function zonedStartOfDay(iso: string, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const guess = utcMidnight(iso);
  let result = guess - zoneOffsetMs(new Date(guess), zone);
  result = guess - zoneOffsetMs(new Date(result), zone); // settle across a daylight-saving change
  return new Date(result);
}

export type PresetKey = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "last3Months" | "thisYear";

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 Days" },
  { key: "last30", label: "Last 30 Days" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "last3Months", label: "Last 3 Months" },
  { key: "thisYear", label: "This Year" },
];

/** A preset as dates, relative to the kitchen's today. Month and year presets cover the whole month or year, upcoming days included. */
export function presetRange(key: PresetKey, todayIso: string): DateRange {
  const [y, m] = todayIso.split("-").map(Number);
  const monthStart = (year: number, month: number) => isoOf(Date.UTC(year, month - 1, 1));
  const monthEnd = (year: number, month: number) => isoOf(Date.UTC(year, month, 0));
  switch (key) {
    case "today":
      return { from: todayIso, to: todayIso };
    case "yesterday":
      return { from: addDaysIso(todayIso, -1), to: addDaysIso(todayIso, -1) };
    case "last7":
      return { from: addDaysIso(todayIso, -6), to: todayIso };
    case "last30":
      return { from: addDaysIso(todayIso, -29), to: todayIso };
    case "thisMonth":
      return { from: monthStart(y, m), to: monthEnd(y, m) };
    case "lastMonth":
      return { from: monthStart(y, m - 1), to: monthEnd(y, m - 1) };
    case "last3Months":
      return { from: addDaysIso(monthStart(y, m - 2), 0), to: todayIso };
    case "thisYear":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
}

export const DEFAULT_PRESET: PresetKey = "thisMonth";

/** Which preset a range is, or null for a custom one. */
export function presetOf(range: DateRange, todayIso: string): PresetKey | null {
  return PRESETS.find((p) => {
    const r = presetRange(p.key, todayIso);
    return r.from === range.from && r.to === range.to;
  })?.key ?? null;
}

/**
 * The range from the page's `?from=&to=`: valid when both are real days, the end is not before the start and it is not
 * longer than MAX_RANGE_DAYS. Anything else falls back to the default preset and says why.
 */
export function parseDashboardRange(from: string | undefined, to: string | undefined, todayIso: string): { range: DateRange; error: string | null } {
  const fallback = presetRange(DEFAULT_PRESET, todayIso);
  if (from === undefined && to === undefined) return { range: fallback, error: null };
  if (!isIsoDay(from) || !isIsoDay(to)) return { range: fallback, error: "That date range isn't valid, so This Month is shown." };
  if (to < from) return { range: fallback, error: "The end date is before the start date, so This Month is shown." };
  if (daysInRange({ from, to }) > MAX_RANGE_DAYS) return { range: fallback, error: `Please pick at most ${MAX_RANGE_DAYS} days, so This Month is shown.` };
  return { range: { from, to }, error: null };
}

/** An optional range (the Orders list): none when neither end is given or when it is not valid, so the list shows every order. */
export function parseOptionalRange(from: string | undefined, to: string | undefined): DateRange | null {
  if (!isIsoDay(from) || !isIsoDay(to) || to < from || daysInRange({ from, to }) > MAX_RANGE_DAYS) return null;
  return { from, to };
}

const dayText = (iso: string, withYear: boolean) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
};

/** "14 Oct 2026", or "1 Oct – 31 Oct 2026" (the year on the start too when the range crosses years). */
export function describeRange(range: DateRange): string {
  if (range.from === range.to) return dayText(range.from, true);
  return `${dayText(range.from, range.from.slice(0, 4) !== range.to.slice(0, 4))} – ${dayText(range.to, true)}`;
}
