import { describe, it, expect } from "vitest";
import { isBackdated } from "@/modules/orders/event-date-rule";

const NOW = new Date(2026, 8, 27, 9, 30); // 27 Sep 2026, local
const day = (d: number) => new Date(2026, 8, d);

describe("isBackdated", () => {
  it("lets the team book today and tomorrow", () => {
    expect(isBackdated(day(27), undefined, NOW)).toBe(false);
    expect(isBackdated(day(28), undefined, NOW)).toBe(false);
    expect(isBackdated(day(29), undefined, NOW)).toBe(false);
  });

  it("refuses any day before today", () => {
    expect(isBackdated(day(26), undefined, NOW)).toBe(true);
    expect(isBackdated(new Date(2026, 0, 1), undefined, NOW)).toBe(true);
  });

  it("does not refuse an existing record's own past date, only a newly chosen one", () => {
    expect(isBackdated(day(20), day(20), NOW)).toBe(false);
    expect(isBackdated(day(21), day(20), NOW)).toBe(true);
  });
});
