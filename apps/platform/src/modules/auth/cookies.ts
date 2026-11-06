import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { SESSION_POLICY } from "./config";

// Signed, host-only cookies for the Account (the RP side). A value is `base64url(json).base64url(hmac)`. The HMAC key is derived from AUTH_SECRET
// separately for each purpose, so a value signed for one purpose is never accepted for another. Verification is constant-time.
export type CookiePurpose = "account-session" | "oidc-transaction";

function key(secret: string, purpose: CookiePurpose): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "platterly-account-cookies", purpose, 32));
}

export function seal(payload: Record<string, unknown>, secret: string, purpose: CookiePurpose): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", key(secret, purpose)).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function unseal<T extends Record<string, unknown>>(value: string | undefined | null, secret: string, purpose: CookiePurpose): T | null {
  if (!value || value.length > 4096) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [body, mac] = parts;
  const expected = createHmac("sha256", key(secret, purpose)).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(mac, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Host-only (no Domain), HttpOnly, SameSite=Lax, Secure in production. `path` narrows a short-lived cookie to the routes that need it. */
export function cookieOptions(maxAgeSeconds: number, path = "/", production = process.env.NODE_ENV === "production") {
  return { httpOnly: true, sameSite: "lax" as const, secure: production, path, maxAge: maxAgeSeconds };
}

export const ACCOUNT_COOKIE_MAX_AGE = SESSION_POLICY.absoluteSeconds;
