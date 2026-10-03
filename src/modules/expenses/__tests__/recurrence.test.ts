import { describe, it, expect } from "vitest";
import { dueOccurrences, nextOccurrence, nthOccurrence, MAX_OCCURRENCES_PER_RUN } from "../recurrence";
import { presetRange, resolveRange, parseIsoDate, toIsoDate } from "../date-range";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (dates: Date[]) => dates.map(toIsoDate);

describe("recurrence dates", () => {
  it("monthly counts from the start, so a 31st clamps to month end without drifting", () => {
    const start = d("2026-01-31");
    expect(iso([0, 1, 2, 3].map((n) => nthOccurrence(start, "MONTHLY", n)))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(toIsoDate(nthOccurrence(d("2024-01-31"), "MONTHLY", 1))).toBe("2024-02-29");
  });

  it("weekly, quarterly and yearly", () => {
    expect(iso([0, 1, 2].map((n) => nthOccurrence(d("2026-10-03"), "WEEKLY", n)))).toEqual(["2026-10-03", "2026-10-10", "2026-10-17"]);
    expect(iso([0, 1, 2, 3].map((n) => nthOccurrence(d("2026-11-15"), "QUARTERLY", n)))).toEqual(["2026-11-15", "2027-02-15", "2027-05-15", "2027-08-15"]);
    expect(iso([0, 1, 2].map((n) => nthOccurrence(d("2024-02-29"), "YEARLY", n)))).toEqual(["2024-02-29", "2025-02-28", "2026-02-28"]);
  });

  it("lists the dates due up to today, from the start by default", () => {
    const dates = dueOccurrences({ start: d("2026-07-01"), frequency: "MONTHLY", endDate: null, through: d("2026-10-03"), after: null });
    expect(iso(dates)).toEqual(["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]);
  });

  it("skips dates up to `after` and stops at the end date", () => {
    const after = dueOccurrences({ start: d("2026-07-01"), frequency: "MONTHLY", endDate: null, through: d("2026-10-03"), after: d("2026-08-15") });
    expect(iso(after)).toEqual(["2026-09-01", "2026-10-01"]);
    const ended = dueOccurrences({ start: d("2026-07-01"), frequency: "MONTHLY", endDate: d("2026-08-31"), through: d("2026-10-03"), after: null });
    expect(iso(ended)).toEqual(["2026-07-01", "2026-08-01"]);
  });

  it("books nothing before the start and caps one run", () => {
    expect(dueOccurrences({ start: d("2026-12-01"), frequency: "MONTHLY", endDate: null, through: d("2026-10-03"), after: null })).toEqual([]);
    expect(dueOccurrences({ start: d("2000-01-01"), frequency: "WEEKLY", endDate: null, through: d("2026-10-03"), after: null })).toHaveLength(MAX_OCCURRENCES_PER_RUN);
  });

  it("finds the next date, or none once the series ended", () => {
    expect(toIsoDate(nextOccurrence({ start: d("2026-07-01"), frequency: "MONTHLY", endDate: null, from: d("2026-10-03") })!)).toBe("2026-11-01");
    expect(nextOccurrence({ start: d("2026-07-01"), frequency: "MONTHLY", endDate: d("2026-09-30"), from: d("2026-10-03") })).toBeNull();
  });
});

describe("date ranges for Profitability", () => {
  it("this month and last month", () => {
    const now = d("2026-10-03");
    expect(presetRange("this-month", now)).toEqual({ from: d("2026-10-01"), to: d("2026-10-31") });
    expect(presetRange("last-month", now)).toEqual({ from: d("2026-09-01"), to: d("2026-09-30") });
    expect(presetRange("last-month", d("2026-01-15"))).toEqual({ from: d("2025-12-01"), to: d("2025-12-31") });
  });

  it("the financial year runs April to March", () => {
    expect(presetRange("this-fy", d("2026-10-03"))).toEqual({ from: d("2026-04-01"), to: d("2027-03-31") });
    expect(presetRange("this-fy", d("2027-02-10"))).toEqual({ from: d("2026-04-01"), to: d("2027-03-31") });
    expect(presetRange("last-fy", d("2026-10-03"))).toEqual({ from: d("2025-04-01"), to: d("2026-03-31") });
    expect(presetRange("all")).toEqual({ from: null, to: null });
  });

  it("a custom range wins over a preset, is swapped when backwards, and bad dates are ignored", () => {
    expect(resolveRange({ range: "this-month", from: "2026-03-01", to: "2026-03-31" }).preset).toBe("custom");
    const swapped = resolveRange({ from: "2026-05-10", to: "2026-05-01" });
    expect([toIsoDate(swapped.from!), toIsoDate(swapped.to!)]).toEqual(["2026-05-01", "2026-05-10"]);
    expect(resolveRange({ from: "2026-05-10" })).toMatchObject({ preset: "custom", to: null });
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("nonsense")).toBeNull();
    expect(resolveRange({ from: "nonsense", to: "2026-13-01" }).preset).toBe("all");
    expect(resolveRange({ range: "bogus" }).preset).toBe("all");
  });
});
