import { describe, it, expect } from "vitest";
import {
  deriveOrderStatus,
  getOrderStatusHint,
  orderStatusForSelection,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_ORDER,
  ORDER_STATUS_TONE,
  MENU_SELECTION_STATUS_LABEL,
} from "@/modules/orders/order-status";
import type { KitchenProductionStatus, MenuSelectionStatus } from "@/generated/prisma/enums";

const sel = (status: MenuSelectionStatus, kitchenProductionStatus: KitchenProductionStatus = "PENDING") => ({ status, kitchenProductionStatus });

describe("Order status labels (AJ, 2026-09-26)", () => {
  it("uses exactly the requested names, in workflow order", () => {
    expect(ORDER_STATUS_ORDER.map((s) => ORDER_STATUS_LABEL[s])).toEqual([
      "Pending Review",
      "Awaiting Customer Approval",
      "Approved",
      "Sent to Kitchen",
      "Completed",
      "Rejected / Cancelled",
    ]);
  });

  it("gives every status a tone from the shared legend", () => {
    expect(ORDER_STATUS_ORDER.map((s) => ORDER_STATUS_TONE[s])).toEqual(["violet", "info", "success", "info", "success", "danger"]);
  });

  it("labels every menu-approval status, including the queue's 'Needs Review' and 'Awaiting Customer Approval'", () => {
    expect(MENU_SELECTION_STATUS_LABEL.DRAFT).toBe("Needs Review");
    expect(MENU_SELECTION_STATUS_LABEL.SENT_TO_CUSTOMER).toBe("Awaiting Customer Approval");
    expect(MENU_SELECTION_STATUS_LABEL.CUSTOMER_REVIEWING).toBe("Customer Reviewing");
    expect(MENU_SELECTION_STATUS_LABEL.FINAL_LOCKED).toBe("Approved & Sent to Kitchen");
    expect(Object.keys(MENU_SELECTION_STATUS_LABEL)).toHaveLength(6);
  });
});

describe("orderStatusForSelection", () => {
  it.each([
    ["DRAFT", "PENDING_REVIEW"],
    ["CHANGES_REQUESTED", "PENDING_REVIEW"],
    ["SENT_TO_CUSTOMER", "AWAITING_CUSTOMER_APPROVAL"],
    ["CUSTOMER_REVIEWING", "AWAITING_CUSTOMER_APPROVAL"],
    ["CUSTOMER_APPROVED", "APPROVED"],
    ["FINAL_LOCKED", "SENT_TO_KITCHEN"],
  ] as const)("menu %s -> order %s", (status, expected) => {
    expect(orderStatusForSelection(sel(status))).toBe(expected);
  });

  it("follows the kitchen once the menu is locked: in flight stays Sent to Kitchen, Delivered completes, Cancelled cancels", () => {
    for (const stage of ["PENDING", "IN_PREPARATION", "READY"] as const) {
      expect(orderStatusForSelection(sel("FINAL_LOCKED", stage))).toBe("SENT_TO_KITCHEN");
    }
    expect(orderStatusForSelection(sel("FINAL_LOCKED", "DELIVERED"))).toBe("COMPLETED");
    expect(orderStatusForSelection(sel("FINAL_LOCKED", "CANCELLED"))).toBe("CANCELLED");
  });

  it("ignores a stale kitchen stage before the menu is locked", () => {
    expect(orderStatusForSelection(sel("CUSTOMER_APPROVED", "DELIVERED"))).toBe("APPROVED");
  });
});

describe("deriveOrderStatus", () => {
  it("returns null when the order has no menu selection, so the caller leaves Order.status alone", () => {
    expect(deriveOrderStatus([])).toBeNull();
  });

  it("shows the least-advanced menu when an order has several events", () => {
    expect(deriveOrderStatus([sel("FINAL_LOCKED", "DELIVERED"), sel("SENT_TO_CUSTOMER"), sel("FINAL_LOCKED")])).toBe("AWAITING_CUSTOMER_APPROVAL");
    expect(deriveOrderStatus([sel("FINAL_LOCKED", "DELIVERED"), sel("FINAL_LOCKED", "READY")])).toBe("SENT_TO_KITCHEN");
  });

  it("one cancelled event doesn't cancel the order; all of them do", () => {
    expect(deriveOrderStatus([sel("FINAL_LOCKED", "CANCELLED"), sel("FINAL_LOCKED", "DELIVERED")])).toBe("COMPLETED");
    expect(deriveOrderStatus([sel("FINAL_LOCKED", "CANCELLED"), sel("FINAL_LOCKED", "CANCELLED")])).toBe("CANCELLED");
  });
});

describe("getOrderStatusHint", () => {
  it("describes each order status in one line", () => {
    expect(getOrderStatusHint("PENDING_REVIEW")).toBe("Team to review menu & items.");
    expect(getOrderStatusHint("AWAITING_CUSTOMER_APPROVAL")).toBe("Menu sent to customer.");
    expect(getOrderStatusHint("COMPLETED")).toBe("Event completed successfully.");
  });

  it("reports the kitchen's own stage once the order is with the kitchen — the least advanced one across several menus", () => {
    expect(getOrderStatusHint("SENT_TO_KITCHEN")).toBe("Order sent to kitchen team.");
    expect(getOrderStatusHint("SENT_TO_KITCHEN", ["PENDING"])).toBe("Waiting for the kitchen to start.");
    expect(getOrderStatusHint("SENT_TO_KITCHEN", ["READY", "IN_PREPARATION"])).toBe("Kitchen is preparing the order.");
    // The kitchen stage only matters while the order is actually with the kitchen.
    expect(getOrderStatusHint("PENDING_REVIEW", ["READY"])).toBe("Team to review menu & items.");
  });
});
