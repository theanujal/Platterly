import { describe, expect, it } from "vitest";
import { parseIsoDate, presetRange, resolveRange, toIsoDate } from "../range";

const at = (iso: string) => new Date(iso);
const iso = (r: { from: Date | null; to: Date | null }) => [r.from && toIsoDate(r.from), r.to && toIsoDate(r.to)];

describe("report ranges", () => {
  it("this and last month, in India time", () => {
    expect(iso(presetRange("this-month", at("2026-10-05T10:00:00Z")))).toEqual(["2026-10-01", "2026-10-31"]);
    expect(iso(presetRange("last-month", at("2026-10-05T10:00:00Z")))).toEqual(["2026-09-01", "2026-09-30"]);
    expect(iso(presetRange("last-month", at("2026-01-15T10:00:00Z")))).toEqual(["2025-12-01", "2025-12-31"]);
    // 31 Oct 20:00 UTC is already 1 Nov in India.
    expect(iso(presetRange("this-month", at("2026-10-31T20:00:00Z")))).toEqual(["2026-11-01", "2026-11-30"]);
  });

  it("the financial year runs April to March", () => {
    expect(iso(presetRange("this-fy", at("2026-10-05T10:00:00Z")))).toEqual(["2026-04-01", "2027-03-31"]);
    expect(iso(presetRange("this-fy", at("2027-02-10T10:00:00Z")))).toEqual(["2026-04-01", "2027-03-31"]);
    expect(iso(presetRange("last-fy", at("2026-10-05T10:00:00Z")))).toEqual(["2025-04-01", "2026-03-31"]);
    expect(iso(presetRange("all"))).toEqual([null, null]);
  });

  it("a custom range wins; unreadable input falls back to this month", () => {
    const now = at("2026-10-05T10:00:00Z");
    expect(iso(resolveRange({ from: "2026-01-02", to: "2026-02-03", range: "all" }, now))).toEqual(["2026-01-02", "2026-02-03"]);
    expect(resolveRange({ from: "2026-01-02" }, now)).toMatchObject({ preset: "custom", to: null });
    expect(resolveRange({ range: "nonsense" }, now)).toMatchObject({ preset: "this-month" });
    expect(resolveRange({ from: "31-12-2026", to: "x" }, now)).toMatchObject({ preset: "this-month" });
  });

  it("only real dates parse", () => {
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2026-02-28")).not.toBeNull();
    expect(parseIsoDate("")).toBeNull();
  });
});
