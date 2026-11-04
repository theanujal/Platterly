import { fail, isRecord, ok, type ParseResult } from "../../contract/src/result";
import { isId } from "../../contract/src/ids";
import { isSequence } from "./sequence";

/**
 * The ID token carries identity only: who signed in, never what they may do (Part 1 section 4, F4.2.2). Memberships come from
 * the signed API. `membership_version` lets a product notice that its copy is stale.
 */
export interface IdTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  iat: number;
  nonce?: string;
  email: string;
  email_verified: boolean;
  name: string;
  membership_version: number;
}

const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/**
 * Shape check on an already signature-verified payload. It does not check issuer, audience, expiry or nonce against what the
 * product expects: that is token validation (F6.3.1). It does refuse a missing or mistyped claim.
 */
export function parseIdTokenClaims(input: unknown): ParseResult<IdTokenClaims> {
  if (!isRecord(input)) return fail("claims must be an object");
  const { iss, aud, sub, exp, iat, nonce, email, email_verified, name, membership_version } = input;
  if (!text(iss, 300)) return fail("iss is required");
  if (!text(aud, 200)) return fail("aud must be one client id");
  if (!text(sub, 100)) return fail("sub is required");
  if (typeof exp !== "number" || !Number.isInteger(exp) || exp <= 0) return fail("exp must be a time");
  if (typeof iat !== "number" || !Number.isInteger(iat) || iat <= 0) return fail("iat must be a time");
  if (nonce !== undefined && !text(nonce, 200)) return fail("nonce must be text");
  if (!text(email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("email is required");
  if (typeof email_verified !== "boolean") return fail("email_verified must be true or false");
  if (typeof name !== "string" || name.length > 200) return fail("name must be text");
  if (!isSequence(membership_version)) return fail("membership_version must be a whole number of 1 or more");
  return ok({ iss, aud, sub, exp, iat, ...(nonce !== undefined ? { nonce } : {}), email, email_verified, name, membership_version });
}

/** Organisation claims (Part 1 section 2): how a person becomes an Owner of a business that already exists. */
export const CLAIM_STATUSES = ["pending", "consumed", "expired", "revoked", "superseded"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** A claim is valid for 14 days and a business can have at most 3 pending owner claims (Part 1 section 2). */
export const CLAIM_VALID_DAYS = 14;
export const MAX_PENDING_OWNER_CLAIMS = 3;

export interface IssueClaimRequest {
  businessId: string;
  /** The one email address that can consume the claim, once verified. Lower-cased. */
  boundEmail: string;
}

export function parseIssueClaimRequest(input: unknown): ParseResult<IssueClaimRequest> {
  if (!isRecord(input)) return fail("the request must be an object");
  if (!isId("business", input.businessId)) return fail("businessId is not valid");
  const email = typeof input.boundEmail === "string" ? input.boundEmail.trim().toLowerCase() : "";
  if (!text(email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("boundEmail is required");
  return ok({ businessId: input.businessId, boundEmail: email });
}
