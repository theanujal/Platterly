import { describe, expect, it } from "vitest";
import { guestBreakdown } from "../guest-summary";

describe("guest breakdown", () => {
  it("adds the kids on top of the adults", () => {
    expect(guestBreakdown(50, 10, 20)).toEqual({ parts: "50 adults + 10 kids (0–5) + 20 kids (5–10)", total: 80 });
  });
  it("leaves out a kids group of zero and keeps singulars", () => {
    expect(guestBreakdown(50, 0, 20).parts).toBe("50 adults + 20 kids (5–10)");
    expect(guestBreakdown(1, 1, 0)).toEqual({ parts: "1 adult + 1 kid (0–5)", total: 2 });
  });
});
