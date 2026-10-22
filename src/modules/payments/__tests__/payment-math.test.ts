import { describe, it, expect } from "vitest";
import { round2, round3 } from "../payment-math";

describe("round2 / round3 (the one copy, issue 74)", () => {
  it("rounds halves up, including the float cases a plain Math.round misses", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round3(1.0005)).toBe(1.001);
  });
});
