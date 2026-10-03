import { describe, it, expect } from "vitest";
import { customerIdFromUnsubscribeToken, unsubscribeUrl } from "@/lib/notifications/unsubscribe";

describe("unsubscribe links", () => {
  const token = (id: string) => unsubscribeUrl(id).split("/unsubscribe/")[1];

  it("round-trips a customer id", () => {
    expect(customerIdFromUnsubscribeToken(token("cust_123"))).toBe("cust_123");
  });

  it("rejects an edited id, an edited signature and garbage", () => {
    const valid = token("cust_123");
    expect(customerIdFromUnsubscribeToken(valid.replace("cust_123", "cust_999"))).toBeNull();
    expect(customerIdFromUnsubscribeToken(`${valid.slice(0, -1)}${valid.endsWith("a") ? "b" : "a"}`)).toBeNull();
    expect(customerIdFromUnsubscribeToken("nonsense")).toBeNull();
    expect(customerIdFromUnsubscribeToken("")).toBeNull();
    expect(customerIdFromUnsubscribeToken(".abc")).toBeNull();
  });
});
