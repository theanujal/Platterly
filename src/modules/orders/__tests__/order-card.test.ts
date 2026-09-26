import { describe, it, expect } from "vitest";
import { KITCHEN_STATUS_TONE, MENU_SELECTION_STATUS_TONE, ORDER_STATUS_TONE } from "@/modules/orders/order-status";
import {
  formatAmountExact,
  formatEventDates,
  formatEventWhen,
  getEventCountdown,
  getGuestCount,
  getOrderLocation,
  getPaymentBreakdown,
  getCardCountdown,
  summarizeMenuApproval,
} from "@/modules/orders/order-card";

// Order dates are UTC midnight (see calendar.ts), so build them the same way.
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = new Date("2026-09-26T09:30:00.000Z");

describe("getEventCountdown", () => {
  it("counts whole days to a future event and stays success while it's comfortably ahead", () => {
    expect(getEventCountdown(day("2026-10-13"), day("2026-10-13"), "AWAITING_CUSTOMER_APPROVAL", NOW)).toEqual({ caption: "Starts in", label: "17 days", tone: "success" });
  });

  it("singularizes 1 day and turns warning once the event is within 2 days", () => {
    expect(getEventCountdown(day("2026-09-27"), day("2026-09-27"), "AWAITING_CUSTOMER_APPROVAL", NOW)).toEqual({ caption: "Starts in", label: "1 day", tone: "yellow" });
    expect(getEventCountdown(day("2026-09-28"), day("2026-09-28"), "AWAITING_CUSTOMER_APPROVAL", NOW)?.tone).toBe("yellow");
    expect(getEventCountdown(day("2026-09-29"), day("2026-09-29"), "AWAITING_CUSTOMER_APPROVAL", NOW)?.tone).toBe("success");
  });

  it("says Today on the event day regardless of the time of day", () => {
    expect(getEventCountdown(day("2026-09-26"), day("2026-09-26"), "AWAITING_CUSTOMER_APPROVAL", NOW)).toMatchObject({ label: "Today", tone: "orange" });
    expect(getEventCountdown(day("2026-09-26"), day("2026-09-26"), "AWAITING_CUSTOMER_APPROVAL", new Date("2026-09-26T23:59:59.000Z"))?.label).toBe("Today");
  });

  it("says Ongoing mid-way through a multi-day event and Ended after it", () => {
    expect(getEventCountdown(day("2026-09-25"), day("2026-09-27"), "AWAITING_CUSTOMER_APPROVAL", NOW)).toMatchObject({ label: "Ongoing", tone: "info" });
    expect(getEventCountdown(day("2026-09-25"), day("2026-09-26"), "AWAITING_CUSTOMER_APPROVAL", NOW)?.label).toBe("Ongoing");
    expect(getEventCountdown(day("2026-09-20"), day("2026-09-25"), "COMPLETED", NOW)).toMatchObject({ label: "Ended", tone: "neutral" });
  });

  it("shows nothing for a cancelled order", () => {
    expect(getEventCountdown(day("2026-10-13"), day("2026-10-13"), "CANCELLED", NOW)).toBeNull();
  });
});

describe("summarizeMenuApproval", () => {
  const sel = (status: Parameters<typeof summarizeMenuApproval>[0][number]["status"], currentVersion = 1) => ({ status, currentVersion });

  it("returns null when the order has no menu selection", () => {
    expect(summarizeMenuApproval([], "AWAITING_CUSTOMER_APPROVAL")).toBeNull();
  });

  it("calls a re-sent menu a revision, but the first send just 'Menu sent'", () => {
    expect(summarizeMenuApproval([sel("SENT_TO_CUSTOMER", 2)], "AWAITING_CUSTOMER_APPROVAL")).toEqual({
      title: "Revised menu sent",
      detail: "Waiting for customer approval.",
      tone: "info",
    });
    expect(summarizeMenuApproval([sel("SENT_TO_CUSTOMER", 1)], "AWAITING_CUSTOMER_APPROVAL")?.title).toBe("Menu sent");
  });

  it("uses the same tone as the Menu Approvals page badges", () => {
    expect(summarizeMenuApproval([sel("DRAFT")], "PENDING_REVIEW")).toMatchObject({ title: "Needs review", tone: "cyan" });
    expect(summarizeMenuApproval([sel("CHANGES_REQUESTED")], "AWAITING_CUSTOMER_APPROVAL")?.tone).toBe("pink");
    expect(summarizeMenuApproval([sel("KITCHEN_CHANGES_REQUESTED")], "AWAITING_CUSTOMER_APPROVAL")?.tone).toBe("fuchsia");
    expect(summarizeMenuApproval([sel("KITCHEN_REVIEWING")], "AWAITING_CUSTOMER_APPROVAL")?.tone).toBe("info");
    expect(summarizeMenuApproval([sel("FINAL_LOCKED")], "AWAITING_CUSTOMER_APPROVAL")?.tone).toBe("success");
  });

  it("surfaces the least-advanced menu when an order has several events", () => {
    expect(summarizeMenuApproval([sel("FINAL_LOCKED"), sel("CUSTOMER_REVIEWING"), sel("KITCHEN_APPROVED")], "AWAITING_CUSTOMER_APPROVAL")?.title).toBe("Customer is reviewing");
  });

  it("describes each step of the new team -> customer -> kitchen flow", () => {
    expect(summarizeMenuApproval([sel("CUSTOMER_APPROVED")], "KITCHEN_REVIEW")).toMatchObject({ title: "Customer approved the menu", tone: "success" });
    expect(summarizeMenuApproval([sel("KITCHEN_REVIEWING")], "KITCHEN_REVIEW")).toMatchObject({ title: "Kitchen is reviewing", tone: "info" });
    expect(summarizeMenuApproval([sel("KITCHEN_CHANGES_REQUESTED")], "PENDING_REVIEW")).toMatchObject({ title: "Kitchen requested changes", tone: "fuchsia" });
    expect(summarizeMenuApproval([sel("FINAL_LOCKED")], "SENT_TO_KITCHEN")).toMatchObject({ title: "Sent to the kitchen", tone: "success" });
  });

  it("has nothing left to wait on once the order is cancelled or completed", () => {
    expect(summarizeMenuApproval([sel("SENT_TO_CUSTOMER")], "CANCELLED")).toBeNull();
    expect(summarizeMenuApproval([sel("SENT_TO_CUSTOMER")], "COMPLETED")).toBeNull();
  });
});

describe("getPaymentBreakdown", () => {
  it("shows the paid/pending split for a partially paid order, with Indian digit grouping", () => {
    expect(getPaymentBreakdown({ total: 121558.14, advance: 60000, paymentStatus: "PARTIALLY_PAID" })).toEqual({
      label: "Partially Paid",
      tone: "info",
      summary: "₹60,000 paid · ₹61,558.14 pending",
    });
  });

  it("treats PAID as fully collected even when advance was never entered", () => {
    expect(getPaymentBreakdown({ total: 5000, advance: 0, paymentStatus: "PAID" })).toEqual({ label: "Paid", tone: "success", summary: "Paid in full" });
  });

  it("shows the whole total as pending when unpaid", () => {
    expect(getPaymentBreakdown({ total: 5000, advance: 0, paymentStatus: "UNPAID" })).toEqual({ label: "Unpaid", tone: "danger", summary: "₹5,000 pending" });
  });

  it("never reports a negative pending amount if the advance exceeds the total", () => {
    expect(getPaymentBreakdown({ total: 1000, advance: 1500, paymentStatus: "PARTIALLY_PAID" }).summary).toBe("₹1,000 paid · ₹0 pending");
  });
});

describe("getGuestCount", () => {
  const base = { totalParticipants: null, adultCount: null, childBelow5Count: null, child5To10Count: null };

  it("prefers the explicit total, then falls back to the sum of the age bands", () => {
    expect(getGuestCount({ ...base, totalParticipants: 120, adultCount: 50 })).toBe(120);
    expect(getGuestCount({ ...base, adultCount: 50, childBelow5Count: 5, child5To10Count: 10 })).toBe(65);
  });

  it("returns null when no guest info was entered", () => {
    expect(getGuestCount(base)).toBeNull();
    expect(getGuestCount({ ...base, totalParticipants: 0 })).toBeNull();
  });
});

describe("list view helpers", () => {
  it("always shows two decimals with Indian grouping in the Total column", () => {
    expect(formatAmountExact(64440)).toBe("₹64,440.00");
    expect(formatAmountExact(121558.14)).toBe("₹1,21,558.14");
  });

  it("formats a single-day and a multi-day event, compactly when it stays within one month", () => {
    expect(formatEventDates(day("2026-12-05"), day("2026-12-05"))).toMatch(/5 Dec(?:t)? 2026|5 Dec 2026/);
    expect(formatEventDates(day("2026-12-05"), day("2026-12-06"))).toMatch(/^5–6 Dec 2026$/);
    expect(formatEventDates(day("2026-11-28"), day("2026-12-02"))).toMatch(/^28 Nov – 2 Dec 2026$/);
  });

  it("uses only the Venue / Building Name for the location — never the address", () => {
    expect(getOrderLocation({ venue: " Ghas Mandi, Bangalore " })).toBe("Ghas Mandi, Bangalore");
    expect(getOrderLocation({ venue: "  " })).toBeNull();
    expect(getOrderLocation({ venue: null })).toBeNull();
  });

  it("shows Today / Tomorrow for an event starting then, otherwise the date — one value, never both", () => {
    expect(formatEventWhen(day("2026-09-26"), day("2026-09-26"), NOW)).toBe("Today");
    expect(formatEventWhen(day("2026-09-27"), day("2026-09-27"), NOW)).toBe("Tomorrow");
    expect(formatEventWhen(day("2026-09-27"), day("2026-09-28"), NOW)).toBe("Tomorrow");
    expect(formatEventWhen(day("2026-09-28"), day("2026-09-28"), NOW)).toBe(formatEventDates(day("2026-09-28"), day("2026-09-28")));
    expect(formatEventWhen(day("2026-10-13"), day("2026-10-13"), NOW)).not.toMatch(/Today|Tomorrow/);
    expect(formatEventWhen(day("2026-09-20"), day("2026-09-25"), NOW)).toBe(formatEventDates(day("2026-09-20"), day("2026-09-25")));
  });
});

describe("getCardCountdown", () => {
  const countdown = (start: string, end: string, status: Parameters<typeof getCardCountdown>[2] = "AWAITING_CUSTOMER_APPROVAL") =>
    getCardCountdown(day(start), day(end), status, NOW);

  it("is always there while the event hasn't ended, including Today and Tomorrow", () => {
    expect(countdown("2026-10-13", "2026-10-13")).toMatchObject({ caption: "Starts in", label: "17 days" });
    expect(countdown("2026-09-27", "2026-09-27")).toMatchObject({ caption: "Starts in", label: "1 day" });
    expect(countdown("2026-09-26", "2026-09-26")).toMatchObject({ label: "Today" });
    expect(countdown("2026-09-25", "2026-09-27")).toMatchObject({ label: "Ongoing" });
  });

  it("drops Ended and cancelled", () => {
    expect(countdown("2026-09-20", "2026-09-25", "COMPLETED")).toBeNull();
    expect(countdown("2026-10-13", "2026-10-13", "CANCELLED")).toBeNull();
  });
});

describe("distinct 'needs attention' tones (AJ, 2026-09-27)", () => {
  it("gives every state that used to share amber its own tone, so they can be told apart on one card", () => {
    const tones = {
      pendingReview: ORDER_STATUS_TONE.PENDING_REVIEW,
      needsReview: MENU_SELECTION_STATUS_TONE.DRAFT,
      changesRequested: MENU_SELECTION_STATUS_TONE.CHANGES_REQUESTED,
      kitchenChangesRequested: MENU_SELECTION_STATUS_TONE.KITCHEN_CHANGES_REQUESTED,
      inPreparation: KITCHEN_STATUS_TONE.IN_PREPARATION,
      oneDay: getEventCountdown(day("2026-09-27"), day("2026-09-27"), "AWAITING_CUSTOMER_APPROVAL", NOW)!.tone,
      today: getEventCountdown(day("2026-09-26"), day("2026-09-26"), "AWAITING_CUSTOMER_APPROVAL", NOW)!.tone,
      unpaid: getPaymentBreakdown({ total: 5000, advance: 0, paymentStatus: "UNPAID" }).tone,
    };
    expect(new Set(Object.values(tones)).size).toBe(Object.keys(tones).length);
    expect(Object.values(tones)).not.toContain("warning");
  });
});
