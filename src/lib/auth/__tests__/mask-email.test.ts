import { describe, it, expect } from "vitest";
import { maskEmail } from "../mask-email";

describe("maskEmail", () => {
  it("masks the middle of a normal local-part, keeping the first/last character", () => {
    expect(maskEmail("ashok@gmail.com")).toBe("a***k@gmail.com");
  });

  it("masks a short (2-character) local-part without a middle", () => {
    expect(maskEmail("ab@gmail.com")).toBe("a*@gmail.com");
  });

  it("masks a single-character local-part", () => {
    expect(maskEmail("a@gmail.com")).toBe("a*@gmail.com");
  });

  it("returns the input unchanged when there's no @ to split on", () => {
    expect(maskEmail("not-an-email")).toBe("not-an-email");
  });
});
