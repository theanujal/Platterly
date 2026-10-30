import { describe, expect, it } from "vitest";
import { yearlyRenewalOpen } from "../billing-math";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-30T10:00:00Z");
const endsIn = (days: number) => new Date(now.getTime() + days * DAY_MS);

describe("yearlyRenewalOpen", () => {
  it("is closed for a yearly plan until its last 30 days", () => {
    expect(yearlyRenewalOpen("ANNUAL", endsIn(365), now)).toBe(false);
    expect(yearlyRenewalOpen("ANNUAL", endsIn(31), now)).toBe(false);
  });

  it("opens on the 30th day before the end, and stays open after the period ends", () => {
    expect(yearlyRenewalOpen("ANNUAL", endsIn(30), now)).toBe(true);
    expect(yearlyRenewalOpen("ANNUAL", endsIn(1), now)).toBe(true);
    expect(yearlyRenewalOpen("ANNUAL", endsIn(-3), now)).toBe(true);
  });

  it("never restricts a monthly plan, a trial or a plan with no end date", () => {
    expect(yearlyRenewalOpen("MONTHLY", endsIn(365), now)).toBe(true);
    expect(yearlyRenewalOpen(null, endsIn(365), now)).toBe(true);
    expect(yearlyRenewalOpen("ANNUAL", null, now)).toBe(true);
  });
});
