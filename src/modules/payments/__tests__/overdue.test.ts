import { describe, it, expect } from "vitest";
import { isPaymentOverdue, tenantTodayStart } from "@/modules/payments/payment-math";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("isPaymentOverdue (AJ, 2026-10-12)", () => {
  const now = new Date("2026-10-12T06:00:00Z"); // 11:30 am in India

  it("is overdue once the event's last day is before today and money is owed", () => {
    expect(isPaymentOverdue({ status: "COMPLETED", paymentStatus: "UNPAID", eventEndDate: day("2026-10-11") }, now)).toBe(true);
    expect(isPaymentOverdue({ status: "APPROVED", paymentStatus: "PARTIALLY_PAID", eventEndDate: day("2026-09-01") }, now)).toBe(true);
  });

  it("is not overdue on the event day itself, or before it", () => {
    expect(isPaymentOverdue({ status: "APPROVED", paymentStatus: "UNPAID", eventEndDate: day("2026-10-12") }, now)).toBe(false);
    expect(isPaymentOverdue({ status: "APPROVED", paymentStatus: "UNPAID", eventEndDate: day("2026-10-20") }, now)).toBe(false);
  });

  it("uses the last day of a multi-day event", () => {
    expect(isPaymentOverdue({ status: "APPROVED", paymentStatus: "UNPAID", eventEndDate: day("2026-10-12") }, now)).toBe(false);
  });

  it("is never overdue when paid or cancelled", () => {
    expect(isPaymentOverdue({ status: "COMPLETED", paymentStatus: "PAID", eventEndDate: day("2026-09-01") }, now)).toBe(false);
    expect(isPaymentOverdue({ status: "CANCELLED", paymentStatus: "UNPAID", eventEndDate: day("2026-09-01") }, now)).toBe(false);
  });

  it("switches day at midnight India time, not UTC", () => {
    // 11 Oct 19:00 UTC is already 12 Oct 00:30 in India, so an event that ended on the 11th is overdue.
    const justPastIstMidnight = new Date("2026-10-11T19:00:00Z");
    expect(tenantTodayStart(justPastIstMidnight).toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(isPaymentOverdue({ status: "APPROVED", paymentStatus: "UNPAID", eventEndDate: day("2026-10-11") }, justPastIstMidnight)).toBe(true);
    // 11 Oct 17:00 UTC is 22:30 on the 11th in India: the 11th is still today.
    expect(isPaymentOverdue({ status: "APPROVED", paymentStatus: "UNPAID", eventEndDate: day("2026-10-11") }, new Date("2026-10-11T17:00:00Z"))).toBe(false);
  });
});
