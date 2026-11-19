import { describe, it, expect } from "vitest";
import { longDate } from "../invoice-format";

describe("longDate (#120)", () => {
  it("prints a moment in India's date, and a picked date as that same day", () => {
    expect(longDate(new Date("2026-11-30T19:30:00Z"))).toBe("1 Dec 2026"); // 01:00 IST
    expect(longDate(new Date("2026-12-01T00:00:00Z"))).toBe("1 Dec 2026"); // date-only, stored at UTC midnight
  });
});
