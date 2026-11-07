import { parsePlatformEvent, type PlatformEvent } from "./events";
import { shouldApply } from "./sequence";
import { verifyPlatformRequest } from "./signing";
import type { VerifyFailure } from "../../contract/src/signing";

export type ReceiveFailure = VerifyFailure | "bad_json" | "invalid_event" | "id_mismatch";
export type ReceiveResult =
  /** `apply` false means a duplicate or older event: answer 200 (so the sender stops retrying) and change nothing. */
  | { ok: true; event: PlatformEvent; apply: boolean }
  | { ok: false; reason: ReceiveFailure; detail?: string };

export interface ReceiveEventInput {
  /** This product's receiving secrets for the Platform channel: two during a rotation. */
  secrets: readonly string[];
  headers: Headers | Record<string, string | string[] | undefined>;
  /** The raw request body, exactly as received (never re-serialised). */
  rawBody: string;
  method: string;
  url: string | URL;
  /** The highest sequence this product has applied for the event's business, or null. Called only after the signature and shape pass. */
  lastApplied: (businessId: string) => number | null | Promise<number | null>;
  now?: number;
}

/**
 * The whole receiving side of an event delivery in the one correct order: verify the route-bound signature over the raw body, parse,
 * check the signed event id equals the body's, then the sequence guard. Nothing is parsed before the signature passes, and the
 * caller applies the event only when `apply` is true (and records the new sequence in the same transaction as the change).
 */
export async function receiveEvent(input: ReceiveEventInput): Promise<ReceiveResult> {
  const verified = verifyPlatformRequest(input.secrets, input.headers, input.rawBody, input.method, input.url, input.now);
  if (!verified.ok) return { ok: false, reason: verified.reason };
  let json: unknown;
  try {
    json = JSON.parse(input.rawBody);
  } catch {
    return { ok: false, reason: "bad_json" };
  }
  const parsed = parsePlatformEvent(json);
  if (!parsed.ok) return { ok: false, reason: "invalid_event", detail: parsed.error };
  if (parsed.value.eventId !== verified.id) return { ok: false, reason: "id_mismatch" };
  const last = await input.lastApplied(parsed.value.businessId);
  return { ok: true, event: parsed.value, apply: shouldApply(last, parsed.value.sequence) };
}
