import { describe, it, expect } from "vitest";
import { DEFAULT_TIME_ZONE, isValidTimeZone, todayStartInZone } from "@/lib/time/timezone";
import { formatEventWhen, getEventCountdown } from "@/modules/orders/order-card";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("business time zone", () => {
  it("defaults to India", () => {
    expect(DEFAULT_TIME_ZONE).toBe("Asia/Kolkata");
  });

  it("accepts real zones and rejects junk", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });

  it("finds today's day in the zone, and falls back to India for an unknown zone", () => {
    const now = new Date("2026-10-11T19:00:00Z"); // 00:30 on the 12th in India, 15:00 on the 11th in New York
    expect(todayStartInZone(now).toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(todayStartInZone(now, "America/New_York").toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect(todayStartInZone(now, "nonsense").toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("Today / Tomorrow follow India's day, not UTC (the old 00:00-05:30 IST bug)", () => {
    const earlyMorningIst = new Date("2026-10-11T20:00:00Z"); // 01:30 on 12 Oct in India
    expect(formatEventWhen(day("2026-10-12"), day("2026-10-12"), earlyMorningIst)).toBe("Today");
    expect(formatEventWhen(day("2026-10-13"), day("2026-10-13"), earlyMorningIst)).toBe("Tomorrow");
    expect(getEventCountdown(day("2026-10-12"), day("2026-10-12"), "APPROVED", earlyMorningIst)?.label).toBe("Today");
  });

  it("uses the chosen zone when one is given", () => {
    const now = new Date("2026-10-11T20:00:00Z"); // still the 11th in New York
    expect(formatEventWhen(day("2026-10-12"), day("2026-10-12"), now, "America/New_York")).toBe("Tomorrow");
  });
});
