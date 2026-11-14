import { describe, expect, it } from "vitest";
import { placeholderBusinessName, signupIdempotencyKey } from "../signup-business";

describe("single sign-up: the business made at verification", () => {
  it("is named after the person until the product's onboarding names it", () => {
    expect(placeholderBusinessName("  Asha   Rao ")).toBe("Asha Rao");
    expect(placeholderBusinessName("")).toBe("My business");
    expect(placeholderBusinessName("   ")).toBe("My business");
    expect(placeholderBusinessName("x".repeat(300))).toHaveLength(120);
  });

  it("uses one idempotency key per person and product, within the 8 to 100 character rule", () => {
    const a = signupIdempotencyKey("sub-1", "caterly");
    expect(a).toBe(signupIdempotencyKey("sub-1", "caterly"));
    expect(a).not.toBe(signupIdempotencyKey("sub-2", "caterly"));
    expect(a).not.toBe(signupIdempotencyKey("sub-1", "other"));
    expect(signupIdempotencyKey("s".repeat(100), "caterly").length).toBeLessThanOrEqual(100);
    expect(a.length).toBeGreaterThanOrEqual(8);
  });
});
