import { describe, expect, it } from "vitest";
import { stackedCredit, unusedCredit } from "../math";

// Upgrade credit when renewals were stacked: renewing early adds a new paid period after the one still running, so what is unused is the rest of the running
// period PLUS every later period in full. Counting only the last payment (the old rule) left the running period's unused days out of the credit.
const DAY = 86_400_000;
const start = new Date("2026-01-01T00:00:00Z");
const at = (days: number) => new Date(start.getTime() + days * DAY);
const year = (n: number) => ({ paidAmount: 10000, periodStart: at(365 * n), periodEnd: at(365 * (n + 1)) });

describe("stackedCredit", () => {
  it("with one payment it equals the single-payment credit", () => {
    const now = at(100);
    const single = unusedCredit({ ...year(0), currentPeriodEnd: year(0).periodEnd, now });
    expect(stackedCredit([year(0)], now)).toEqual(single);
  });

  it("two stacked years: the rest of the first year plus the whole second year", () => {
    const r = stackedCredit([year(0), year(1)], at(100));
    // 265 days of the first year are left (10000 x 265 / 365 = 7260.27) and all of the second (10000).
    expect(r).toEqual({ credit: 17260.27, daysLeft: 630 });
  });

  it("the old rule (last payment only) under-credits the same case", () => {
    const old = unusedCredit({ ...year(1), currentPeriodEnd: year(1).periodEnd, now: at(100) });
    expect(old.credit).toBe(10000);
    expect(stackedCredit([year(0), year(1)], at(100)).credit).toBeGreaterThan(old.credit);
  });

  it("a period that has fully run out adds nothing, and one that has not started counts in full", () => {
    expect(stackedCredit([year(0), year(1), year(2)], at(400))).toEqual(stackedCredit([year(1), year(2)], at(400)));
    expect(stackedCredit([year(0), year(1)], at(-30))).toEqual({ credit: 20000, daysLeft: 730 });
  });

  it("never more than was paid in total, rounds to paise, and is zero with nothing paid or nothing left", () => {
    const r = stackedCredit([{ paidAmount: 999.99, periodStart: start, periodEnd: at(365) }, { paidAmount: 999.99, periodStart: at(365), periodEnd: at(730) }], at(100));
    expect(r.credit).toBe(Math.round(r.credit * 100) / 100);
    expect(r.credit).toBeLessThan(1999.98);
    expect(stackedCredit([], at(0))).toEqual({ credit: 0, daysLeft: 0 });
    expect(stackedCredit([year(0), year(1)], at(900))).toEqual({ credit: 0, daysLeft: 0 });
    expect(stackedCredit([{ ...year(0), paidAmount: 0 }], at(10))).toEqual({ credit: 0, daysLeft: 0 });
  });
});
