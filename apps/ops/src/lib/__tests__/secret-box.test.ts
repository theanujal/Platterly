import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, newSigningSecret } from "@/lib/secret-box";

describe("secret box", () => {
  it("round-trips and never stores the plain text", () => {
    const secret = newSigningSecret();
    const stored = encryptSecret(secret);
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain(secret);
    expect(decryptSecret(stored)).toBe(secret);
  });

  it("encrypts the same secret differently each time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("refuses a tampered or unreadable value", () => {
    const parts = encryptSecret("secret").split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
    expect(() => decryptSecret("nonsense")).toThrow();
  });

  it("makes long, distinct signing secrets", () => {
    const a = newSigningSecret();
    expect(a.length).toBeGreaterThan(40);
    expect(newSigningSecret()).not.toBe(a);
  });
});
