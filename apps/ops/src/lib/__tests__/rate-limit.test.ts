import { describe, it, expect } from "vitest";
import { isRateLimited, trackedKeys } from "../rate-limit";

describe("isRateLimited", () => {
  it("limits within the window and forgets addresses whose window has passed (issue 84)", () => {
    const hour = 60 * 60 * 1000;
    const start = 1_000_000_000_000;
    expect(isRateLimited("t:1.1.1.1", 1, hour, start)).toBe(false);
    expect(isRateLimited("t:1.1.1.1", 1, hour, start + 1)).toBe(true);
    for (let i = 0; i < 100; i++) isRateLimited(`t:10.0.0.${i}`, 5, hour, start);
    expect(trackedKeys()).toBeGreaterThanOrEqual(101);

    isRateLimited("t:2.2.2.2", 5, hour, start + 2 * hour);
    expect(trackedKeys()).toBe(1);
  });
});
