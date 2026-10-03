import { describe, it, expect } from "vitest";
import nextConfig, { SECURITY_HEADERS } from "../../../../next.config";

/**
 * Chunk 17.3 — response headers. Everything is protected against being framed by another site and against content-type
 * sniffing; only the public storefront and its order flow may be embedded (Settings -> Integration -> Iframe).
 */
describe("security headers (next.config.ts)", () => {
  it("sends the hardening headers on every path", async () => {
    const rules = await nextConfig.headers!();
    const everything = rules.find((r) => r.source === "/:path*")!;
    const keys = everything.headers.map((h) => h.key);
    for (const header of SECURITY_HEADERS) expect(keys).toContain(header.key);
    const get = (k: string) => everything.headers.find((h) => h.key === k)?.value ?? "";
    expect(get("Strict-Transport-Security")).toMatch(/max-age=\d{8,}/);
    expect(get("Strict-Transport-Security")).toContain("includeSubDomains");
    expect(get("X-Content-Type-Options")).toBe("nosniff");
    expect(get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(get("Permissions-Policy")).toContain("camera=()");
    expect(get("Content-Security-Policy")).toBe("frame-ancestors 'self'");
  });

  it("only the storefront and its order flow may be embedded by other sites", async () => {
    const rules = await nextConfig.headers!();
    const open = rules.filter((r) => r.headers.some((h) => h.key === "Content-Security-Policy" && h.value === "frame-ancestors *")).map((r) => r.source);
    expect(open).toHaveLength(2);
    expect(open.some((s) => s.startsWith("/:tenantSlug/plan"))).toBe(true);
    // The single-segment storefront rule must exclude the app's own routes (admin, sign-in, ops, unsubscribe...).
    const storefront = open.find((s) => !s.includes("plan"))!;
    for (const reserved of ["super", "kitchenlogin", "dashboard", "settings", "api", "unsubscribe"]) expect(storefront).toContain(reserved);
  });

  it("does not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
