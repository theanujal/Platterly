import { signedHeaders, verifyRequest, type VerifyResult } from "../../contract/src/signing";
import { isId } from "../../contract/src/ids";
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

/** Where a product asks the Platform for a business's current state (route-bound GET; the product signs with its answer secret). */
export const PULL_STATE_PATH = "/api/products/state";

export type PullMemberStatus = "active" | "disabled" | "removed";
export type PullBusinessStatus = "active" | "suspended" | "closed";

/**
 * What the Platform says about one business RIGHT NOW (one consistent read): the business status, every member with the product-facing role and status,
 * and the business's event `sequence` and `membershipVersion` at that moment. The product applies the differences with the same code that applies events,
 * then treats every event up to `sequence` as seen. Names, phone and email are not here (they follow the Account through `person.profile`).
 */
export interface BusinessStateSnapshot {
  businessId: string;
  status: PullBusinessStatus;
  sequence: number;
  membershipVersion: number;
  members: { userId: string; /** The identity provider's person id; null when the Platform has none for this person. */ subject: string | null; role: string; status: PullMemberStatus }[];
}

const STATUSES: readonly string[] = ["active", "suspended", "closed"];
const MEMBER_STATUSES: readonly string[] = ["active", "disabled", "removed"];

export function parseBusinessStateSnapshot(input: unknown): ParseResult<BusinessStateSnapshot> {
  if (!isRecord(input)) return fail("the snapshot must be an object");
  if (!isId("business", input.businessId)) return fail("businessId is not valid");
  if (typeof input.status !== "string" || !STATUSES.includes(input.status)) return fail("status is not known");
  if (typeof input.sequence !== "number" || !Number.isSafeInteger(input.sequence) || input.sequence < 0) return fail("sequence must be a whole number");
  if (typeof input.membershipVersion !== "number" || !Number.isSafeInteger(input.membershipVersion) || input.membershipVersion < 0) return fail("membershipVersion must be a whole number");
  if (!Array.isArray(input.members) || input.members.length > 500) return fail("members must be a list");
  const members: BusinessStateSnapshot["members"] = [];
  for (const m of input.members) {
    if (!isRecord(m)) return fail("a member must be an object");
    if (typeof m.userId !== "string" || !m.userId || m.userId.length > 100) return fail("member.userId is required");
    if (m.subject !== null && (typeof m.subject !== "string" || !m.subject || m.subject.length > 100)) return fail("member.subject must be text or null");
    if (typeof m.role !== "string" || !m.role || m.role.length > 64) return fail("member.role is required");
    if (typeof m.status !== "string" || !MEMBER_STATUSES.includes(m.status)) return fail("member.status is not known");
    members.push({ userId: m.userId, subject: m.subject, role: m.role, status: m.status as PullMemberStatus });
  }
  return ok({ businessId: input.businessId, status: input.status as PullBusinessStatus, sequence: input.sequence, membershipVersion: input.membershipVersion, members });
}
