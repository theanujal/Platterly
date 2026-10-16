import { describe, expect, it } from "vitest";
import { customerHasApproved } from "../payment-math";

describe("customerHasApproved", () => {
  it.each(["APPROVED", "SENT_TO_KITCHEN", "COMPLETED"])("%s lets the team record payments", (status) => {
    expect(customerHasApproved(status)).toBe(true);
  });
  it.each(["PENDING_REVIEW", "AWAITING_CUSTOMER_APPROVAL", "CANCELLED"])("%s does not", (status) => {
    expect(customerHasApproved(status)).toBe(false);
  });
});
