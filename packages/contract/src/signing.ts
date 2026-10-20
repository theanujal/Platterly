import { createHmac, timingSafeEqual } from "node:crypto";
import { CONTRACT_VERSION, SIGNATURE_TOLERANCE_SECONDS } from "./version";

/**
 * Same scheme as the outbound webhooks (Chunk 25):
 *   X-Platterly-Signature: v1=<hex HMAC-SHA256 of "<timestamp>.<raw body>">
 * A request between ops and a product is also bound to where it is going (issue 80), so one captured request can't be
 * replayed against another route or another business's id:
 *   X-Platterly-Signature: v2=<hex HMAC-SHA256 of "<timestamp>.<METHOD>.<path with query>.<raw body>">
 * Responses, and the website's own calls, stay v1. One secret per product per direction. During a rotation both the old
 * and the new secret are valid, so verify takes a list.
 */
export const HEADERS = {
  timestamp: "x-platterly-timestamp",
  signature: "x-platterly-signature",
  id: "x-platterly-event-id",
  contract: "x-platterly-contract",
} as const;

/** Where a signed request is going: the method and the path with its query string, never the host (ops and a product may see different ones). */
export type SignedTarget = { method: string; path: string };

export function requestTarget(method: string, url: string | URL): SignedTarget {
  const parsed = new URL(url);
  return { method: method.toUpperCase(), path: parsed.pathname + parsed.search };
}

export function signBody(secret: string, timestamp: number, body: string, target?: SignedTarget): string {
  const signed = target ? `${timestamp}.${target.method}.${target.path}.${body}` : `${timestamp}.${body}`;
  return `${target ? "v2" : "v1"}=${createHmac("sha256", secret).update(signed).digest("hex")}`;
}

type SignOptions = { now?: number; target?: SignedTarget };

/** The headers to send with `body`. `id` is the event id or command id; a retry sends the same one. Pass `target` for a request. */
export function signedHeaders(secret: string, id: string, body: string, { now = Math.floor(Date.now() / 1000), target }: SignOptions = {}): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-platterly-timestamp": String(now),
    "x-platterly-signature": signBody(secret, now, body, target),
    "x-platterly-event-id": id,
    "x-platterly-contract": String(CONTRACT_VERSION),
  };
}

export type VerifyFailure = "missing_headers" | "bad_timestamp" | "stale_timestamp" | "bad_signature" | "no_secret";
export type VerifyResult = { ok: true; id: string; contract: number } | { ok: false; reason: VerifyFailure };

type HeaderSource = Headers | Record<string, string | string[] | undefined>;

function read(headers: HeaderSource, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
}

/**
 * Verifies a request (or response) over its raw body. Constant-time compare; rejects a timestamp outside the tolerance.
 * With `target`, only a v2 signature made for that method and path passes.
 */
export function verifyRequest(secrets: readonly string[], headers: HeaderSource, rawBody: string, { now = Math.floor(Date.now() / 1000), target }: SignOptions = {}): VerifyResult {
  const usable = secrets.filter((s) => s.length > 0);
  if (usable.length === 0) return { ok: false, reason: "no_secret" };
  const signature = read(headers, HEADERS.signature);
  const timestampHeader = read(headers, HEADERS.timestamp);
  const id = read(headers, HEADERS.id);
  if (!signature || !timestampHeader || !id) return { ok: false, reason: "missing_headers" };
  if (!/^\d{9,12}$/.test(timestampHeader)) return { ok: false, reason: "bad_timestamp" };
  const timestamp = Number(timestampHeader);
  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: "stale_timestamp" };
  const given = Buffer.from(signature);
  const matched = usable.some((secret) => {
    const expected = Buffer.from(signBody(secret, timestamp, rawBody, target));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  if (!matched) return { ok: false, reason: "bad_signature" };
  const contractHeader = Number(read(headers, HEADERS.contract));
  return { ok: true, id, contract: Number.isInteger(contractHeader) && contractHeader > 0 ? contractHeader : CONTRACT_VERSION };
}
