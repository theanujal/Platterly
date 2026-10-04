import { describe, it, expect } from "vitest";
import { orderedValue, receivedValue, remainingQuantity, statusAfterReceipt, outstandingBalance } from "../po-math";

const line = (quantity: number, receivedQuantity: number, unitCost = 10) => ({ quantity, receivedQuantity, unitCost });

describe("purchasing maths", () => {
  it("ordered and received value", () => {
    expect(orderedValue([line(10, 0, 40), line(2, 0, 150.5)])).toBe(701);
    expect(receivedValue([line(10, 5, 40), line(2, 2, 150.5)])).toBe(501);
  });
  it("remaining never goes below zero and keeps 3 places", () => {
    expect(remainingQuantity(line(10, 2.5))).toBe(7.5);
    expect(remainingQuantity(line(1, 1.0004))).toBe(0);
  });
  it("status after a receipt", () => {
    expect(statusAfterReceipt([line(5, 5), line(2, 2)])).toBe("RECEIVED");
    expect(statusAfterReceipt([line(5, 5), line(2, 0)])).toBe("PARTIALLY_RECEIVED");
    expect(statusAfterReceipt([line(5, 0)])).toBe("ORDERED");
  });
  it("outstanding balance, including paid ahead", () => {
    expect(outstandingBalance(1000, 400)).toBe(600);
    expect(outstandingBalance(100, 250)).toBe(-150);
  });
});
