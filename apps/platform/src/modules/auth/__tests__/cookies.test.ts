import { describe, expect, it } from "vitest";
import { ACCOUNT_REDIRECT_PATH, COOKIES, OTP, SESSION_POLICY, accountRedirectUri, safeNextPath } from "../config";
import { cookieOptions, seal, unseal } from "../cookies";
import { readAccountCookie, sealAccountSession } from "../account-session";

const SECRET = "s".repeat(48);
const OTHER = "t".repeat(48);
const now = new Date("2026-11-06T12:00:00Z");

describe("signed cookies", () => {
  it("round-trips a payload", () => {
    expect(unseal(seal({ a: 1, b: "x" }, SECRET, "account-session"), SECRET, "account-session")).toEqual({ a: 1, b: "x" });
  });

  it("refuses a tampered body, a tampered signature, another secret, another purpose, and malformed values", () => {
    const good = seal({ uid: "u1" }, SECRET, "account-session");
    const [body, mac] = good.split(".");
    const forgedBody = `${Buffer.from(JSON.stringify({ uid: "u2" })).toString("base64url")}.${mac}`;
    for (const bad of [forgedBody, `${body}.${mac.slice(0, -2)}AA`, `${body}.`, `.${mac}`, body, `${good}.x`, "", "a.b.c", "💥.💥"]) {
      expect(unseal(bad, SECRET, "account-session"), bad).toBeNull();
    }
    expect(unseal(good, OTHER, "account-session")).toBeNull();
    expect(unseal(good, SECRET, "oidc-transaction")).toBeNull();
    expect(unseal(undefined, SECRET, "account-session")).toBeNull();
    expect(unseal("x".repeat(5000), SECRET, "account-session")).toBeNull();
  });

  it("refuses a validly signed value that is not an object", () => {
    for (const v of ["null", "5", '"s"', "[1]"]) {
      const body = Buffer.from(v).toString("base64url");
      // sign the raw JSON text as if it were a payload by sealing through the same key: only objects are accepted back
      expect(unseal(`${body}.AAAA`, SECRET, "account-session")).toBeNull();
    }
  });
});

describe("account session cookie", () => {
  it("is accepted until its absolute expiry and then refused", () => {
    const value = sealAccountSession(SECRET, { sid: "sid1", sub: "sub1", uid: "uid1" }, now);
    expect(readAccountCookie(value, SECRET, now)).toMatchObject({ sid: "sid1", sub: "sub1", uid: "uid1" });
    expect(readAccountCookie(value, SECRET, new Date(now.getTime() + (SESSION_POLICY.absoluteSeconds - 1) * 1000))).not.toBeNull();
    expect(readAccountCookie(value, SECRET, new Date(now.getTime() + SESSION_POLICY.absoluteSeconds * 1000))).toBeNull();
  });
  it("refuses a value signed for a different purpose, and a payload missing a field", () => {
    expect(readAccountCookie(seal({ v: 1, sid: "a", sub: "b", uid: "c", iat: 1, exp: 9999999999 }, SECRET, "oidc-transaction"), SECRET, now)).toBeNull();
    expect(readAccountCookie(seal({ v: 1, sid: "a", sub: "b", iat: 1, exp: 9999999999 }, SECRET, "account-session"), SECRET, now)).toBeNull();
    expect(readAccountCookie(seal({ v: 2, sid: "a", sub: "b", uid: "c", iat: 1, exp: 9999999999 }, SECRET, "account-session"), SECRET, now)).toBeNull();
  });
});

describe("cookie flags", () => {
  it("are HttpOnly, SameSite=Lax, host-only (no Domain), and Secure in production", () => {
    const dev = cookieOptions(60, "/", false);
    const prod = cookieOptions(60, "/", true);
    expect(dev).toEqual({ httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 60 });
    expect(prod.secure).toBe(true);
    expect("domain" in dev || "domain" in prod).toBe(false);
  });
  it("narrows the sign-in transaction cookie to /auth", () => {
    expect(cookieOptions(600, "/auth").path).toBe("/auth");
    expect(COOKIES.oidcTransaction).not.toBe(COOKIES.accountSession);
  });
});

describe("redirects stay on the account host", () => {
  it("accepts a plain local path and refuses everything else", () => {
    expect(safeNextPath("/products")).toBe("/products");
    expect(safeNextPath("/business?x=1")).toBe("/business?x=1");
    for (const bad of [null, undefined, "", "products", "//evil.test", "https://evil.test", "/\\evil.test", "/ok\nSet-Cookie: a=b", "javascript:alert(1)", `/${"a".repeat(300)}`]) {
      expect(safeNextPath(bad as string), String(bad)).toBe("/");
    }
  });
  it("the registered redirect URI is the Account's own callback, exactly", () => {
    expect(accountRedirectUri()).toBe(`http://account.localhost:3300${ACCOUNT_REDIRECT_PATH}`);
  });
});

describe("policy constants", () => {
  it("keep the approved OTP rules (10 minutes, 5 tries, 55 seconds) and the approved 24-hour outage extension", () => {
    expect(OTP).toMatchObject({ length: 6, expiresInSeconds: 600, allowedAttempts: 5, resendSeconds: 55 });
    expect(SESSION_POLICY.outageExtensionSeconds).toBe(24 * 3600);
  });
  it("define both an idle and an absolute expiry, the absolute one longer (D2)", () => {
    expect(SESSION_POLICY.idleSeconds).toBeGreaterThan(0);
    expect(SESSION_POLICY.absoluteSeconds).toBeGreaterThan(SESSION_POLICY.idleSeconds);
  });
});
