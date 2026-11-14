import { describe, expect, it } from "vitest";
import { readMethodRequest, readVerifyRequest } from "../purchase";

const sig = "a".repeat(64);

describe("Store: what a verify request may carry", () => {
  it("accepts an order's values, an auto-pay's values, or an auto-pay setup report, and nothing else", () => {
    expect(readVerifyRequest({ razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: sig })).toEqual({ razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: sig });
    expect(readVerifyRequest({ razorpaySubscriptionId: "sub_1", razorpayPaymentId: "pay_1", signature: sig })).toEqual({ razorpaySubscriptionId: "sub_1", razorpayPaymentId: "pay_1", signature: sig });
    expect(readVerifyRequest({ razorpaySubscriptionId: "sub_1", failed: { reason: "declined", detail: "Card declined" } })).toEqual({ razorpaySubscriptionId: "sub_1", failed: { reason: "declined", detail: "Card declined" } });
    expect(readVerifyRequest({ razorpaySubscriptionId: "sub_1", failed: { reason: "not_finished" } })).toEqual({ razorpaySubscriptionId: "sub_1", failed: { reason: "not_finished", detail: null } });
    for (const bad of [null, {}, { razorpayOrderId: "order_1" }, { razorpayOrderId: "o", razorpaySubscriptionId: "s", razorpayPaymentId: "p", signature: sig }, { razorpaySubscriptionId: "sub_1", failed: { reason: "other" } }, { razorpaySubscriptionId: "sub_1", razorpayPaymentId: "pay_1" }]) {
      expect(readVerifyRequest(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("Store: what a payment-method request may carry", () => {
  it("reads the product and one of the six actions with the values that action needs", () => {
    expect(readMethodRequest({ action: "list", productKey: "caterly" })).toEqual({ action: "list", productKey: "caterly" });
    expect(readMethodRequest({ action: "add", productKey: "caterly" })).toEqual({ action: "add", productKey: "caterly" });
    expect(readMethodRequest({ action: "primary", productKey: "caterly", methodId: "pm_1" })).toEqual({ action: "primary", productKey: "caterly", methodId: "pm_1" });
    expect(readMethodRequest({ action: "remove", productKey: "caterly", methodId: "pm_1" })).toEqual({ action: "remove", productKey: "caterly", methodId: "pm_1" });
    expect(readMethodRequest({ action: "add-verify", productKey: "caterly", razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: sig })).toEqual({ action: "add-verify", productKey: "caterly", razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: sig });
    expect(readMethodRequest({ action: "primary-verify", productKey: "caterly", razorpaySubscriptionId: "sub_1", razorpayPaymentId: "pay_1", signature: sig })).toEqual({ action: "primary-verify", productKey: "caterly", razorpaySubscriptionId: "sub_1", razorpayPaymentId: "pay_1", signature: sig });
  });

  it("refuses an unknown action, a missing or bad product, and missing values", () => {
    for (const bad of [null, {}, { action: "list" }, { action: "list", productKey: "Bad Key" }, { action: "nope", productKey: "caterly" }, { action: "primary", productKey: "caterly" }, { action: "remove", productKey: "caterly", methodId: "" }, { action: "add-verify", productKey: "caterly", razorpayOrderId: "o" }]) {
      expect(readMethodRequest(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
