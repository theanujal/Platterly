/** Date ranges for the reports pages: the presets people use, in India's financial year (April to March), or a custom from/to. */
export type RangePreset = "this-month" | "last-month" | "this-fy" | "last-fy" | "all";
export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "this-fy", label: "This financial year" },
  { id: "last-fy", label: "Last financial year" },
  { id: "all", label: "All time" },
];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

export function parseIsoDate(value: string | undefined | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || toIsoDate(d) !== value ? null : d;
}

/** Calendar days as UTC midnights (a date, not a moment): `to` is the last day included. */
export function presetRange(preset: RangePreset, now: Date = new Date()): { from: Date | null; to: Date | null } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const day = (year: number, month: number, d: number) => new Date(Date.UTC(year, month, d));
  const fyStartYear = m >= 3 ? y : y - 1;
  switch (preset) {
    case "this-month":
      return { from: day(y, m, 1), to: day(y, m + 1, 0) };
    case "last-month":
      return { from: day(y, m - 1, 1), to: day(y, m, 0) };
    case "this-fy":
      return { from: day(fyStartYear, 3, 1), to: day(fyStartYear + 1, 2, 31) };
    case "last-fy":
      return { from: day(fyStartYear - 1, 3, 1), to: day(fyStartYear, 2, 31) };
    default:
      return { from: null, to: null };
  }
}

/** `?range=<preset>` or `?from=&to=`; a custom pair wins. Anything unreadable falls back to "this month". */
export function resolveRange(query: { range?: string; from?: string; to?: string }, now: Date = new Date()): { from: Date | null; to: Date | null; preset: RangePreset | "custom" } {
  const from = parseIsoDate(query.from);
  const to = parseIsoDate(query.to);
  if (from || to) return { from, to, preset: "custom" };
  const preset = (RANGE_PRESETS.find((p) => p.id === query.range)?.id ?? "this-month") as RangePreset;
  return { ...presetRange(preset, now), preset };
}
