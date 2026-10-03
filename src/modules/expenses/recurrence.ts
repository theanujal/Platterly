// Client-safe: when a recurring expense falls due. All dates are UTC calendar dates.
export type RecurrenceFrequencyValue = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

export const RECURRENCE_FREQUENCIES: RecurrenceFrequencyValue[] = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"];

export const RECURRENCE_LABEL: Record<RecurrenceFrequencyValue, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

/** Safety stop: one run never books more than this many dates for a template. */
export const MAX_OCCURRENCES_PER_RUN = 400;

const MONTHS_PER_STEP: Record<Exclude<RecurrenceFrequencyValue, "WEEKLY">, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };

export const utcDate = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** The nth date of the series, always counted from the start so a 31st clamps to the month's end without drifting. */
export function nthOccurrence(start: Date, frequency: RecurrenceFrequencyValue, n: number): Date {
  const s = utcDate(start);
  if (frequency === "WEEKLY") return new Date(s.getTime() + n * 7 * 86_400_000);
  const totalMonths = s.getUTCMonth() + n * MONTHS_PER_STEP[frequency];
  const year = s.getUTCFullYear() + Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(s.getUTCDate(), lastDay)));
}

/**
 * Every date of the series in (after, through] and not past `endDate`. `after` null means "from the start".
 * Capped at MAX_OCCURRENCES_PER_RUN.
 */
export function dueOccurrences(input: { start: Date; frequency: RecurrenceFrequencyValue; endDate: Date | null; through: Date; after: Date | null }): Date[] {
  const through = utcDate(input.through);
  const after = input.after ? utcDate(input.after) : null;
  const end = input.endDate ? utcDate(input.endDate) : null;
  const dates: Date[] = [];
  for (let n = 0; n < 100_000 && dates.length < MAX_OCCURRENCES_PER_RUN; n++) {
    const d = nthOccurrence(input.start, input.frequency, n);
    if (d.getTime() > through.getTime()) break;
    if (end && d.getTime() > end.getTime()) break;
    if (after && d.getTime() <= after.getTime()) continue;
    dates.push(d);
  }
  return dates;
}

/** The first date of the series after `from` (today), or null when the series has ended. */
export function nextOccurrence(input: { start: Date; frequency: RecurrenceFrequencyValue; endDate: Date | null; from: Date }): Date | null {
  const from = utcDate(input.from);
  const end = input.endDate ? utcDate(input.endDate) : null;
  for (let n = 0; n < 100_000; n++) {
    const d = nthOccurrence(input.start, input.frequency, n);
    if (end && d.getTime() > end.getTime()) return null;
    if (d.getTime() > from.getTime()) return d;
  }
  return null;
}
