import { describe, expect, it } from "vitest";
import { orderKindFor } from "../order-kind";

describe("orderKindFor", () => {
  it("is Single for one event date and one kind of meal, however many meals", () => {
    expect(orderKindFor(1, ["LUNCH"])).toBe("SINGLE");
    expect(orderKindFor(1, ["LUNCH", "LUNCH"])).toBe("SINGLE");
  });
  it("is Multi for a second meal type or a second event date", () => {
    expect(orderKindFor(1, ["LUNCH", "DINNER"])).toBe("MULTI");
    expect(orderKindFor(2, ["LUNCH"])).toBe("MULTI");
  });
});
