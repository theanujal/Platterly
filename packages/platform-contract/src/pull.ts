import { signedHeaders, verifyRequest, type VerifyResult } from "../../contract/src/signing";
import { fail, isRecord, ok, type ParseResult } from "../../contract/src/result";
import { signPlatformRequest } from "./signing";

/**
 * Signed pull (Part 1 section 4, layer 2): a product asks Platform for a business's current state and compares it with its copy. The
 * request is a route-bound GET with an empty body (the business id and version are in the path and query, so they are signed). The
 * answer is signed over its raw body with the response scheme (`v1`, no route), so a tampered or swapped answer is refused.
 */
export function signPullRequest(secret: string, requestId: string, url: string | URL, now?: number): Record<string, string> {
  return signPlatformRequest(secret, requestId, "", "GET", url, now);
}

/** Server side: the headers to send with a pull answer. */
export function signPullResponse(secret: string, requestId: string, rawBody: string, now?: number): Record<string, string> {
  return signedHeaders(secret, requestId, rawBody, { now });
}

export type PullFailure = "bad_signature" | "stale_timestamp" | "bad_timestamp" | "missing_headers" | "no_secret" | "id_mismatch" | "bad_json" | "not_an_object";

/**
 * Verifies a pull answer and returns its JSON. The answer must be signed with the id of the request it answers, so an answer to one
 * pull cannot be passed off as the answer to another. The caller then validates the object's shape (for example the membership list).
 */
export function verifyPullResponse(secrets: readonly string[], requestId: string, headers: Headers | Record<string, string | string[] | undefined>, rawBody: string, now?: number): ParseResult<Record<string, unknown>> & { reason?: PullFailure } {
  const verified: VerifyResult = verifyRequest(secrets, headers, rawBody, { now });
  if (!verified.ok) return { ...fail(`pull answer refused: ${verified.reason}`), reason: verified.reason };
  if (verified.id !== requestId) return { ...fail("pull answer refused: id_mismatch"), reason: "id_mismatch" };
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { ...fail("pull answer refused: bad_json"), reason: "bad_json" };
  }
  if (!isRecord(json)) return { ...fail("pull answer refused: not_an_object"), reason: "not_an_object" };
  return ok(json);
}
