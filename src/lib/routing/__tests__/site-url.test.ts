import { describe, it, expect } from "vitest";
import { marketingSiteUrl } from "../site-url";

describe("marketingSiteUrl", () => {
  it("points at the apex site in production", () => {
    expect(marketingSiteUrl("/terms/", "https://catering.platterly.in")).toBe("https://platterly.in/terms/");
  });
  it("points at the local site in dev", () => {
    expect(marketingSiteUrl("/privacy/", "http://catering.localhost:3000")).toBe("http://localhost:3100/privacy/");
  });
  it("falls back to the dev address when the app url is not set", () => {
    expect(marketingSiteUrl("/terms/", undefined)).toBe("http://localhost:3100/terms/");
  });
});
