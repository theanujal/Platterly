import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Chunk 25 — how a receiver knows a webhook really came from Platterly. Every request carries
 *   X-Platterly-Timestamp: <unix seconds>
 *   X-Platterly-Signature: v1=<hex HMAC-SHA256 of "<timestamp>.<raw body>" with the endpoint's secret>
 *   X-Platterly-Event-Id / X-Platterly-Event
 * The receiver recomputes the signature over the raw body, compares in constant time, and rejects a timestamp more
 * than a few minutes old (replay protection). The same event id is sent again on a retry, so it can also be de-duplicated.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signPayload(secret: string, timestamp: number, body: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** What a receiver does (also used by our own tests and documented in docs/webhooks.md). */
export function verifySignature(secret: string, header: string | null, timestampHeader: string | null, rawBody: string, now: number = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !timestampHeader || !/^\d{9,12}$/.test(timestampHeader)) return false;
  const timestamp = Number(timestampHeader);
  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signPayload(secret, timestamp, rawBody));
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
