import { describe, expect, it } from "vitest";
import { hostKind, originFor, requestHost, trustedOrigins } from "../hosts";

describe("host routing", () => {
  it("knows the three surfaces, with or without a port, in any case", () => {
    expect(hostKind("auth.localhost:3300", "localhost")).toBe("auth");
    expect(hostKind("account.localhost", "localhost")).toBe("account");
    expect(hostKind("STORE.Localhost:3300", "localhost")).toBe("store");
    expect(hostKind("auth.platterly.in", "platterly.in")).toBe("auth");
  });

  it("treats a bare, unknown, empty or look-alike host as other", () => {
    for (const host of ["localhost:3300", "127.0.0.1:3300", "", null, undefined, "xauth.localhost", "auth.localhost.evil.test", "auth.evil.test", "ops.localhost", "catering.localhost", "a.auth.localhost"]) {
      expect(hostKind(host, "localhost")).toBe("other");
    }
  });

  it("prefers X-Forwarded-Host over Host", () => {
    const h = (map: Record<string, string>) => ({ get: (n: string) => map[n] ?? null });
    expect(requestHost(h({ host: "127.0.0.1", "x-forwarded-host": "auth.platterly.in" }))).toBe("auth.platterly.in");
    expect(requestHost(h({ host: "auth.localhost:3300" }))).toBe("auth.localhost:3300");
  });

  it("builds http origins for a localhost root and https for a real one, three of them, no wildcard", () => {
    expect(originFor("auth", "localhost:3300")).toBe("http://auth.localhost:3300");
    expect(trustedOrigins("localhost:3300")).toEqual(["http://auth.localhost:3300", "http://account.localhost:3300", "http://store.localhost:3300"]);
    expect(trustedOrigins("platterly.in")).toEqual(["https://auth.platterly.in", "https://account.platterly.in", "https://store.platterly.in"]);
  });
});
