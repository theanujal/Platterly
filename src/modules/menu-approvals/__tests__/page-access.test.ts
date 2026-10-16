import { describe, it, expect } from "vitest";
import { approvalCapabilities, notStartedState, orderPageMode, parseOrderTab, priceIsFrozen, menuIsWithCustomer } from "@/modules/menu-approvals/page-access";

// The pure rules behind the order page's Menu Approval tab (Phase 2 of the Menu Approvals + Orders merge).

describe("orderPageMode", () => {
  it("gives the editable page to anyone who can edit orders, the restricted view to approval-only, and nothing to the rest", () => {
    expect(orderPageMode({ editOrders: true, approveMenus: true })).toBe("edit");
    expect(orderPageMode({ editOrders: true, approveMenus: false })).toBe("edit");
    expect(orderPageMode({ editOrders: false, approveMenus: true })).toBe("approval-only");
    expect(orderPageMode({ editOrders: false, approveMenus: false })).toBe("none");
  });
});

describe("approvalCapabilities", () => {
  it("lets menus: approve act, and needs orders: edit as well for the price quote (Decision 8)", () => {
    expect(approvalCapabilities({ editOrders: true, approveMenus: true })).toEqual({ canAct: true, canQuotePrice: true });
    expect(approvalCapabilities({ editOrders: false, approveMenus: true })).toEqual({ canAct: true, canQuotePrice: false });
    expect(approvalCapabilities({ editOrders: true, approveMenus: false })).toEqual({ canAct: false, canQuotePrice: false });
    expect(approvalCapabilities({ editOrders: false, approveMenus: false })).toEqual({ canAct: false, canQuotePrice: false });
  });
});

describe("parseOrderTab", () => {
  it("accepts the tabs the page has and ignores anything else", () => {
    expect(parseOrderTab("approval")).toBe("approval");
    expect(parseOrderTab("pricing")).toBe("pricing");
    expect(parseOrderTab("nonsense")).toBeUndefined();
    expect(parseOrderTab("")).toBeUndefined();
    expect(parseOrderTab(undefined)).toBeUndefined();
  });
});

describe("notStartedState", () => {
  const both = { editOrders: true, approveMenus: true };
  it("can start with an Event Type on an open order, for someone who can approve", () => {
    expect(notStartedState({ status: "PENDING_REVIEW", eventTypeId: "t" }, both)).toEqual({ canStart: true, reason: null });
    expect(notStartedState({ status: "PENDING_REVIEW", eventTypeId: "t" }, { editOrders: false, approveMenus: true })).toEqual({ canStart: true, reason: null });
  });
  it("cannot start without an Event Type, and says who can fix it", () => {
    const withEdit = notStartedState({ status: "PENDING_REVIEW", eventTypeId: null }, both);
    expect(withEdit.canStart).toBe(false);
    expect(withEdit.reason).toMatch(/Set one in Order Details/);
    const approvalOnly = notStartedState({ status: "PENDING_REVIEW", eventTypeId: null }, { editOrders: false, approveMenus: true });
    expect(approvalOnly.reason).toMatch(/Ask someone who can edit the order/);
  });
  it("cannot start on a Completed or Cancelled order, or without menus: approve", () => {
    expect(notStartedState({ status: "COMPLETED", eventTypeId: "t" }, both)).toMatchObject({ canStart: false, reason: expect.stringMatching(/closed/) });
    expect(notStartedState({ status: "CANCELLED", eventTypeId: "t" }, both)).toMatchObject({ canStart: false, reason: expect.stringMatching(/closed/) });
    expect(notStartedState({ status: "PENDING_REVIEW", eventTypeId: "t" }, { editOrders: true, approveMenus: false })).toMatchObject({ canStart: false, reason: expect.stringMatching(/approve menus/) });
  });
});

describe("priceIsFrozen", () => {
  it("freezes the price in every stage but Needs Review and Changes Requested, and not before a menu approval exists", () => {
    expect(priceIsFrozen(null)).toBe(false);
    expect(priceIsFrozen("DRAFT")).toBe(false);
    expect(priceIsFrozen("CHANGES_REQUESTED")).toBe(false);
    for (const status of ["SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING", "CUSTOMER_APPROVED", "FINAL_LOCKED"] as const) expect(priceIsFrozen(status), status).toBe(true);
  });
});

describe("menuIsWithCustomer", () => {
  it("is true only while the menu is in front of the customer, not before, after approval or with the kitchen", () => {
    expect(menuIsWithCustomer(null)).toBe(false);
    expect(menuIsWithCustomer("DRAFT")).toBe(false);
    expect(menuIsWithCustomer("CHANGES_REQUESTED")).toBe(false);
    expect(menuIsWithCustomer("SENT_TO_CUSTOMER")).toBe(true);
    expect(menuIsWithCustomer("CUSTOMER_REVIEWING")).toBe(true);
    expect(menuIsWithCustomer("CUSTOMER_APPROVED")).toBe(false);
  });
});
