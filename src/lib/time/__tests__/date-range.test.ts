import { describe, expect, it } from "vitest";
import { addDaysIso, dayKeyInZone, daysInRange, parseDashboardRange, presetOf, presetRange, zonedStartOfDay } from "../date-range";

describe("dashboard date range", () => {
  const today = "2026-10-14"; // a Wednesday

  it("builds every preset from the kitchen's today", () => {
    expect(presetRange("today", today)).toEqual({ from: "2026-10-14", to: "2026-10-14" });
    expect(presetRange("yesterday", today)).toEqual({ from: "2026-10-13", to: "2026-10-13" });
    expect(presetRange("last7", today)).toEqual({ from: "2026-10-08", to: "2026-10-14" });
    expect(presetRange("last30", today)).toEqual({ from: "2026-09-15", to: "2026-10-14" });
    expect(presetRange("thisMonth", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("lastMonth", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("last3Months", today)).toEqual({ from: "2026-08-01", to: "2026-10-14" });
    expect(presetRange("thisYear", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("handles a January 'last month' and recognises presets", () => {
    expect(presetRange("lastMonth", "2027-01-10")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(presetOf({ from: "2026-10-08", to: "2026-10-14" }, today)).toBe("last7");
    expect(presetOf({ from: "2026-10-02", to: "2026-10-05" }, today)).toBeNull();
  });

  it("counts both end days", () => {
    expect(daysInRange({ from: "2026-10-14", to: "2026-10-14" })).toBe(1);
    expect(daysInRange({ from: "2026-10-08", to: "2026-10-14" })).toBe(7);
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("accepts a good range and falls back with a reason for a bad one", () => {
    expect(parseDashboardRange("2026-10-02", "2026-10-05", today)).toEqual({ range: { from: "2026-10-02", to: "2026-10-05" }, error: null });
    expect(parseDashboardRange(undefined, undefined, today).range).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(parseDashboardRange("2026-10-05", "2026-10-02", today).error).toMatch(/before the start/);
    expect(parseDashboardRange("nope", "2026-10-02", today).error).toMatch(/isn't valid/);
    expect(parseDashboardRange("2026-02-31", "2026-03-02", today).error).toMatch(/isn't valid/);
    expect(parseDashboardRange("2024-01-01", "2026-10-02", today).error).toMatch(/at most 400/);
  });

  it("uses the kitchen's time zone for day boundaries", () => {
    // 2026-10-13 20:00 UTC is already 14 Oct, 01:30 in India but still 13 Oct in New York
    const instant = new Date("2026-10-13T20:00:00Z");
    expect(dayKeyInZone(instant, "Asia/Kolkata")).toBe("2026-10-14");
    expect(dayKeyInZone(instant, "America/New_York")).toBe("2026-10-13");
    expect(zonedStartOfDay("2026-10-14", "Asia/Kolkata").toISOString()).toBe("2026-10-13T18:30:00.000Z");
    expect(zonedStartOfDay("2026-10-14", "UTC").toISOString()).toBe("2026-10-14T00:00:00.000Z");
    expect(zonedStartOfDay("2026-07-04", "America/New_York").toISOString()).toBe("2026-07-04T04:00:00.000Z"); // daylight saving
  });
});
