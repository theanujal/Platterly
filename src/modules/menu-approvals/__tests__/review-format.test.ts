import { describe, it, expect } from "vitest";
import { AUTHOR_LABEL, BANNER_CLASS, EDITABLE_STATUSES, WITH_CUSTOMER, formatCurrency, formatDateTime, stageBanner } from "@/modules/menu-approvals/_components/review/approval-format";
import { EDITABLE_STATUSES as SERVER_EDITABLE_STATUSES } from "@/modules/menu-approvals/menu-approval";
import { MENU_SELECTION_STATUS_ORDER } from "@/modules/orders/order-status";

// The pure helpers behind the Menu Approvals review components (extracted from the review page in Phase 1 of the merge).
// They were moved unchanged, so these pin the text and tones the page showed before.

describe("stageBanner", () => {
  it("tells the team what to do next at each stage", () => {
    expect(stageBanner("DRAFT", 1, "Needs Review")).toBeNull();
    expect(stageBanner("CHANGES_REQUESTED", 2, "Changes Requested")).toEqual({
      tone: "danger",
      text: "The customer requested changes. Update the menu, then send a new version for approval.",
      noteLink: "View Customer Note",
    });
    expect(stageBanner("SENT_TO_CUSTOMER", 1, "Awaiting Customer Approval")).toEqual({
      tone: "info",
      text: "Version 1 is with the customer — Awaiting Customer Approval",
      noteLink: null,
    });
    expect(stageBanner("CUSTOMER_REVIEWING", 3, "Customer Reviewing")?.text).toBe("Version 3 is with the customer — Customer Reviewing");
    expect(stageBanner("CUSTOMER_APPROVED", 2, "Customer Approved")?.text).toBe(
      "The customer approved version 2. Send it to the kitchen when everything is ready, or recall it to change something.",
    );
  });

  it("shows no banner once the menu is with the kitchen, and every banner tone has a style", () => {
    expect(stageBanner("FINAL_LOCKED", 1, "Approved & Sent to Kitchen")).toBeNull();
    for (const status of MENU_SELECTION_STATUS_ORDER) {
      const banner = stageBanner(status, 1, status);
      if (banner) expect(BANNER_CLASS[banner.tone]).toBeTruthy();
    }
  });
});

describe("status groups", () => {
  it("mirror the server's rule for when the menu can be edited", () => {
    // The page hides the editing controls from this list; menu-approval.ts enforces it. They must never drift apart.
    expect([...EDITABLE_STATUSES].sort()).toEqual([...SERVER_EDITABLE_STATUSES].sort());
  });

  it("keep editable and with-the-customer separate", () => {
    expect(EDITABLE_STATUSES.some((status) => WITH_CUSTOMER.includes(status))).toBe(false);
    expect(WITH_CUSTOMER).toEqual(["SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING"]);
  });
});

describe("formatting", () => {
  it("writes rupees with Indian grouping and two decimals", () => {
    expect(formatCurrency(0)).toBe("₹0.00");
    expect(formatCurrency(40000)).toBe("₹40,000.00");
    expect(formatCurrency(1234567.5)).toBe("₹12,34,567.50");
  });

  it("writes a date and time in the en-IN style, from a Date", () => {
    const text = formatDateTime(new Date("2026-10-01T09:30:00Z"));
    expect(text).toMatch(/^1 Oct 2026, \d{1,2}:\d{2}\s?(am|pm)$/i);
  });

  it("labels each note author", () => {
    expect(AUTHOR_LABEL).toEqual({ CUSTOMER: "Customer", KITCHEN: "Kitchen", TEAM: "Team" });
  });
});
