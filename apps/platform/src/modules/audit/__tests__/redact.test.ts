import { describe, expect, it } from "vitest";
import { REDACTED, isSensitiveKey, redact, sensitivePaths } from "../redact";

describe("sensitive keys", () => {
  it.each(["secret", "clientSecret", "api_secret", "token", "resetToken", "access-token", "tokens", "password", "passwordHash", "newPassword", "otp", "OTP", "emailOtp", "hash", "request_hash", "sha256Hash"])("%s is sensitive", (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });
  it.each(["email", "name", "footprint", "photo", "organisationId", "memberCount", "status", "potato"])("%s is not sensitive", (key) => {
    expect(isSensitiveKey(key)).toBe(false);
  });
  it("a word that merely contains a sensitive part is flagged (over-redaction is the safe side)", () => {
    expect(isSensitiveKey("hashtag")).toBe(true);
  });
});

describe("redact", () => {
  it("replaces the value of every sensitive key at any depth, in arrays too, and keeps the key", () => {
    const input = { a: 1, token: "abc", nested: { passwordHash: "x", ok: true, list: [{ otp: "123456", id: 1 }, "plain"] } };
    const out = redact(input);
    expect(out).toEqual({ a: 1, token: REDACTED, nested: { passwordHash: REDACTED, ok: true, list: [{ otp: REDACTED, id: 1 }, "plain"] } });
    expect(input.token).toBe("abc");
    expect(JSON.stringify(out)).not.toMatch(/abc|"x"|123456/);
  });
  it("leaves scalars, null and clean objects alone", () => {
    expect(redact(null)).toBeNull();
    expect(redact(5)).toBe(5);
    expect(redact({ a: [1, 2], b: { c: "d" } })).toEqual({ a: [1, 2], b: { c: "d" } });
  });
  it("sensitivePaths lists where the sensitive keys are", () => {
    expect(sensitivePaths({ a: { secret: 1 }, list: [{ token: 2 }], fine: 3 })).toEqual(["a.secret", "list[].token"]);
  });
});
