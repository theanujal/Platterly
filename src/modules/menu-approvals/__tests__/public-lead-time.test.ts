import { describe, it, expect } from "vitest";
import { earliestPublicEventDate } from "@/modules/menu-approvals/public-lead-time";

describe("earliestPublicEventDate", () => {
  it("is two calendar days after the caller's own day, across month and year ends", () => {
    expect(earliestPublicEventDate(new Date(2026, 8, 27, 0, 30))).toBe("2026-09-29");
    expect(earliestPublicEventDate(new Date(2026, 8, 27, 23, 59))).toBe("2026-09-29");
    expect(earliestPublicEventDate(new Date(2026, 8, 29, 10, 0))).toBe("2026-10-01");
    expect(earliestPublicEventDate(new Date(2026, 11, 30, 10, 0))).toBe("2027-01-01");
  });
});
