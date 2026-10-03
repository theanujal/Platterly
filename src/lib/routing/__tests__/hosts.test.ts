import { describe, it, expect } from "vitest";
import { hostKind, originFor, requestHost, trustedOrigins } from "../hosts";

describe("hostKind", () => {
  it("knows the product and ops hosts, in dev and in production", () => {
    expect(hostKind("catering.localhost:3000", "localhost")).toBe("catering");
    expect(hostKind("ops.localhost:3000", "localhost")).toBe("ops");
    expect(hostKind("catering.platterly.in", "platterly.in")).toBe("catering");
    expect(hostKind("OPS.Platterly.in", "platterly.in")).toBe("ops");
  });

  it("treats the apex, a bare host, an IP and nothing as other", () => {
    for (const host of ["localhost:3000", "platterly.in", "127.0.0.1:3000", "", null, undefined]) {
      expect(hostKind(host, host === "platterly.in" ? "platterly.in" : "localhost")).toBe("other");
    }
    expect(hostKind("platterly.in", "platterly.in")).toBe("other");
  });

  it("does not accept look-alike hosts", () => {
    expect(hostKind("catering.evil.test", "platterly.in")).toBe("other");
    expect(hostKind("catering.platterly.in.evil.test", "platterly.in")).toBe("other");
    expect(hostKind("ops.localhost.evil.test", "localhost")).toBe("other");
    expect(hostKind("cateringx.platterly.in", "platterly.in")).toBe("other");
    expect(hostKind("a.catering.platterly.in", "platterly.in")).toBe("other");
    // the wrong root: a production host does not count in dev and the reverse
    expect(hostKind("catering.platterly.in", "localhost")).toBe("other");
  });
});

describe("host helpers", () => {
  it("prefers the host the visitor typed behind a proxy", () => {
    const headers = (map: Record<string, string>) => ({ get: (name: string) => map[name] ?? null });
    expect(requestHost(headers({ host: "127.0.0.1:3000", "x-forwarded-host": "catering.platterly.in" }))).toBe("catering.platterly.in");
    expect(requestHost(headers({ host: "catering.localhost:3000" }))).toBe("catering.localhost:3000");
  });

  it("builds every origin from the root domain", () => {
    expect(originFor("catering")).toMatch(/^https?:\/\/catering\./);
    expect(trustedOrigins().some((o) => o.includes("ops."))).toBe(true);
    expect(trustedOrigins().some((o) => o.includes("catering."))).toBe(true);
  });
});
