// Client-safe: the date ranges the Profitability page can filter by. All dates are UTC calendar dates.
export type RangePreset = "this-month" | "last-month" | "this-fy" | "last-fy" | "all";

export const RANGE_PRESET_LABEL: Record<RangePreset, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "this-fy": "This financial year",
  "last-fy": "Last financial year",
  all: "All time",
};

export const RANGE_PRESETS: RangePreset[] = ["this-month", "last-month", "this-fy", "last-fy", "all"];

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
export const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

export function parseIsoDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || toIsoDate(d) !== value ? null : d;
}

/** India's financial year runs 1 April to 31 March. */
export function presetRange(preset: RangePreset, now: Date = new Date()): { from: Date | null; to: Date | null } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (preset === "all") return { from: null, to: null };
  if (preset === "this-month") return { from: day(y, m, 1), to: day(y, m + 1, 0) };
  if (preset === "last-month") return { from: day(y, m - 1, 1), to: day(y, m, 0) };
  const fyStartYear = m >= 3 ? y : y - 1;
  const startYear = preset === "this-fy" ? fyStartYear : fyStartYear - 1;
  return { from: day(startYear, 3, 1), to: day(startYear + 1, 3, 0) };
}

/** Resolves the page's query (?range=, or ?from= and ?to=) into a range. A custom range wins over a preset. */
export function resolveRange(query: { range?: string; from?: string; to?: string }, now: Date = new Date()): { from: Date | null; to: Date | null; preset: RangePreset | "custom" } {
  const from = parseIsoDate(query.from);
  const to = parseIsoDate(query.to);
  if (from || to) {
    // Dates typed the wrong way round are swapped rather than showing nothing.
    return from && to && from.getTime() > to.getTime() ? { from: to, to: from, preset: "custom" } : { from, to, preset: "custom" };
  }
  const preset = RANGE_PRESETS.find((p) => p === query.range) ?? "all";
  return { ...presetRange(preset, now), preset };
}
