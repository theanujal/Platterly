import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

const mac = (value: string, secret: string) => createHmac("sha256", secret).update(value).digest("base64url");

/** `<value>.<signature>`: the cookie is a pointer only; the server still looks the session up on every request. */
export function sign(value: string, secret: string): string {
  return `${value}.${mac(value, secret)}`;
}

export function unsign(signed: string | undefined | null, secret: string): string | null {
  if (!signed) return null;
  const dot = signed.lastIndexOf(".");
  if (dot < 1) return null;
  const value = signed.slice(0, dot);
  const given = Buffer.from(signed.slice(dot + 1));
  const expected = Buffer.from(mac(value, secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? value : null;
}

/** A signed JSON payload (the sign-in transaction). */
export const seal = (payload: object, secret: string) => sign(Buffer.from(JSON.stringify(payload)).toString("base64url"), secret);
export function unseal<T>(signed: string | undefined | null, secret: string): T | null {
  const value = unsign(signed, secret);
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString()) as T;
  } catch {
    return null;
  }
}
