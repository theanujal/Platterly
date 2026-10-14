import { describe, expect, it } from "vitest";
import { isOrderLocked, ORDER_LOCKED_MESSAGE, OrderLockedError } from "../order-lock";

describe("order lock", () => {
  it("locks from Sent to Kitchen onwards, not before", () => {
    expect(isOrderLocked("SENT_TO_KITCHEN")).toBe(true);
    expect(isOrderLocked("COMPLETED")).toBe(true);
    for (const status of ["PENDING_REVIEW", "AWAITING_CUSTOMER_APPROVAL", "APPROVED", "CANCELLED"] as const) expect(isOrderLocked(status)).toBe(false);
  });
  it("is a plain message a person can read", () => {
    expect(new OrderLockedError().message).toBe(ORDER_LOCKED_MESSAGE);
    expect(ORDER_LOCKED_MESSAGE).toMatch(/sent to the kitchen/);
  });
});
