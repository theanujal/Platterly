import { timingSafeEqual } from "node:crypto";
import { jwtVerify, type CryptoKey, type KeyObject, type JWK } from "jose";
import { parseIdTokenClaims, type IdTokenClaims } from "./claims";

/** Only asymmetric algorithms: a token signed with a shared secret (HS*) or with none can never pass, whatever the header says. */
export const ID_TOKEN_ALGORITHMS = ["EdDSA", "ES256", "RS256"] as const;
/** Clock difference tolerated between the provider and a product, in seconds, for `exp` and `iat`. */
export const TOKEN_CLOCK_TOLERANCE_SECONDS = 30;

/**
 * Any key `jose` accepts for verification. The key-function arm is structural on purpose: the apps and this package may resolve different (compatible) copies
 * of `jose`, whose nominal types would otherwise refuse each other's `createRemoteJWKSet` result.
 */
export type TokenKey = ((...args: never[]) => unknown) | CryptoKey | KeyObject | JWK | Uint8Array;

export type TokenFailure = "invalid_signature" | "wrong_issuer" | "wrong_audience" | "expired" | "not_yet_valid" | "wrong_nonce" | "invalid_claims" | "email_not_verified" | "malformed";
export type TokenResult = { ok: true; claims: IdTokenClaims } | { ok: false; reason: TokenFailure };

export interface ValidateIdTokenOptions {
  /** The provider's public keys: `createLocalJWKSet(jwks)` or `createRemoteJWKSet(url)`, or one public key. */
  key: TokenKey;
  /** What this product expects, never read from the token. */
  issuer: string;
  audience: string;
  /** The nonce this product put in the authorisation request. Required: a token for another sign-in attempt is refused. */
  nonce: string;
  /** Default true: a person whose email the provider has not verified is not accepted. */
  requireVerifiedEmail?: boolean;
  now?: Date;
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Maps a jose error to a failure the caller can log. It never carries the token. */
function reasonFor(error: unknown): Exclude<TokenFailure, "wrong_nonce" | "email_not_verified"> {
  const code = (error as { code?: string } | null)?.code;
  if (code === "ERR_JWT_EXPIRED") return "expired";
  if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
    const claim = (error as { claim?: string }).claim;
    if (claim === "iss") return "wrong_issuer";
    if (claim === "aud") return "wrong_audience";
    if (claim === "iat" || claim === "nbf") return "not_yet_valid";
    return "invalid_claims";
  }
  if (code === "ERR_JWS_INVALID" || code === "ERR_JWT_INVALID") return "malformed";
  // Wrong key, no matching key, disallowed algorithm and anything unexpected all fail closed as a signature failure.
  return "invalid_signature";
}

type VerifiedJwt = { ok: true; payload: Record<string, unknown> } | { ok: false; reason: TokenFailure };

/** The checks every ID token needs whatever claims it carries: signature, issuer, one audience, expiry, issued-at, and this sign-in's nonce. */
async function verifyIdJwt(token: string, options: ValidateIdTokenOptions): Promise<VerifiedJwt> {
  if (typeof token !== "string" || token.length === 0 || token.length > 16_384) return { ok: false, reason: "malformed" };
  let payload: Record<string, unknown>;
  try {
    const verify = jwtVerify as (jwt: string, key: unknown, opts: object) => Promise<{ payload: Record<string, unknown> }>;
    payload = (
      await verify(token, options.key, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: [...ID_TOKEN_ALGORITHMS],
        requiredClaims: ["iss", "aud", "sub", "exp", "iat"],
        clockTolerance: TOKEN_CLOCK_TOLERANCE_SECONDS,
        currentDate: options.now,
      })
    ).payload;
  } catch (error) {
    return { ok: false, reason: reasonFor(error) };
  }
  // jose accepts an audience list that contains the client id; a product token has exactly one audience.
  if (Array.isArray(payload.aud)) return { ok: false, reason: "wrong_audience" };
  // `iat` in the future beyond the tolerance (jose checks only exp and nbf).
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (typeof payload.iat === "number" && payload.iat > nowSeconds + TOKEN_CLOCK_TOLERANCE_SECONDS) return { ok: false, reason: "not_yet_valid" };
  if (typeof payload.nonce !== "string" || !same(payload.nonce, options.nonce)) return { ok: false, reason: "wrong_nonce" };
  return { ok: true, payload };
}

/**
 * Validates an ID token that carries the full minimal claim set (`sub`, email, verified, name, `membership_version`; F4.2.2). Nothing in the
 * token is trusted before the signature, issuer, audience, expiry and nonce pass, and the result carries identity only: roles and memberships
 * come from the signed API, never from here.
 *
 * NOTE: the Platform provider does not yet put email, name or `membership_version` in the ID token (they come from userinfo), so a real token
 * from it fails this function with `invalid_claims`. Use `validateIdentityToken` until F4.2.2 decides where those claims live.
 */
export async function validateIdToken(token: string, options: ValidateIdTokenOptions): Promise<TokenResult> {
  const verified = await verifyIdJwt(token, options);
  if (!verified.ok) return verified;
  const parsed = parseIdTokenClaims(verified.payload);
  if (!parsed.ok) return { ok: false, reason: "invalid_claims" };
  if ((options.requireVerifiedEmail ?? true) && !parsed.value.email_verified) return { ok: false, reason: "email_not_verified" };
  return { ok: true, claims: parsed.value };
}

/** What an identity-only ID token proves: who signed in, in which provider session, and when. */
export interface IdentityClaims {
  iss: string;
  aud: string;
  sub: string;
  /** The provider session id, needed to end exactly this session on a back-channel logout. Absent only if the provider did not issue one. */
  sid?: string;
  exp: number;
  iat: number;
  nonce: string;
}
export type IdentityTokenResult = { ok: true; claims: IdentityClaims } | { ok: false; reason: Exclude<TokenFailure, "email_not_verified"> };

/**
 * Validates an ID token that proves identity only (this is what the Platform provider issues today: `iss`, `aud`, `sub`, `sid`, `exp`, `iat`,
 * `nonce`, `auth_time`, `acr`, `at_hash`). The same signature, issuer, single-audience, expiry, issued-at and nonce checks as `validateIdToken`.
 * The person's email and name are NOT in the token: ask the provider's userinfo endpoint with the access token and require its `sub` to equal this
 * token's `sub`, as the Account does. Never read an email from an unverified source.
 */
export async function validateIdentityToken(token: string, options: Omit<ValidateIdTokenOptions, "requireVerifiedEmail">): Promise<IdentityTokenResult> {
  const verified = await verifyIdJwt(token, options);
  if (!verified.ok) return verified as IdentityTokenResult;
  const p = verified.payload;
  const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
  if (!text(p.iss, 300) || !text(p.aud, 200) || !text(p.sub, 100) || !text(p.nonce, 200) || typeof p.exp !== "number" || typeof p.iat !== "number") return { ok: false, reason: "invalid_claims" };
  if (p.sid !== undefined && !text(p.sid, 200)) return { ok: false, reason: "invalid_claims" };
  return { ok: true, claims: { iss: p.iss, aud: p.aud, sub: p.sub, ...(p.sid !== undefined ? { sid: p.sid as string } : {}), exp: p.exp, iat: p.iat, nonce: p.nonce } };
}

/** OpenID Connect Back-Channel Logout 1.0 section 2.4. */
export const BACKCHANNEL_LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";
export const LOGOUT_TOKEN_TYP = "logout+jwt";

export type LogoutTokenFailure = "invalid_signature" | "invalid_claims" | "wrong_issuer" | "wrong_audience" | "expired" | "not_yet_valid" | "wrong_type" | "missing_event" | "nonce_present" | "no_subject" | "missing_jti" | "malformed";
export type LogoutTokenResult = { ok: true; sub?: string; sid?: string; jti: string; exp: number } | { ok: false; reason: LogoutTokenFailure };

export interface ValidateLogoutTokenOptions {
  key: ValidateIdTokenOptions["key"];
  issuer: string;
  audience: string;
  now?: Date;
}

/**
 * Validates a back-channel logout token the way a product must before ending any session: signature (asymmetric algorithms only), issuer, this
 * product's audience, expiry, `typ` of `logout+jwt` (so an ID token can never be replayed as a logout token), the logout event, no `nonce`, a
 * `jti`, and a `sub` or `sid`. The caller must also refuse a `jti` it has seen before (replay) and end only the session named by `sid` when
 * there is one, otherwise every session of `sub`.
 */
export async function validateLogoutToken(token: string, options: ValidateLogoutTokenOptions): Promise<LogoutTokenResult> {
  if (typeof token !== "string" || token.length === 0 || token.length > 16_384) return { ok: false, reason: "malformed" };
  let payload: Record<string, unknown>;
  try {
    const verify = jwtVerify as (jwt: string, key: unknown, opts: object) => Promise<{ payload: Record<string, unknown> }>;
    payload = (
      await verify(token, options.key, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: [...ID_TOKEN_ALGORITHMS],
        typ: LOGOUT_TOKEN_TYP,
        requiredClaims: ["iss", "aud", "iat", "exp", "jti", "events"],
        clockTolerance: TOKEN_CLOCK_TOLERANCE_SECONDS,
        currentDate: options.now,
      })
    ).payload;
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "ERR_JOSE_GENERIC" && /typ/i.test(String((error as Error).message))) return { ok: false, reason: "wrong_type" };
    if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && (error as { claim?: string }).claim === "typ") return { ok: false, reason: "wrong_type" };
    if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && (error as { claim?: string }).claim === "jti") return { ok: false, reason: "missing_jti" };
    return { ok: false, reason: reasonFor(error) };
  }
  if (Array.isArray(payload.aud)) return { ok: false, reason: "wrong_audience" };
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (typeof payload.iat !== "number" || payload.iat > nowSeconds + TOKEN_CLOCK_TOLERANCE_SECONDS) return { ok: false, reason: "not_yet_valid" };
  const events = payload.events;
  if (typeof events !== "object" || events === null || !(BACKCHANNEL_LOGOUT_EVENT in events)) return { ok: false, reason: "missing_event" };
  if ("nonce" in payload) return { ok: false, reason: "nonce_present" };
  if (typeof payload.jti !== "string" || payload.jti.length === 0) return { ok: false, reason: "missing_jti" };
  const sub = typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : undefined;
  const sid = typeof payload.sid === "string" && payload.sid.length > 0 ? payload.sid : undefined;
  if (!sub && !sid) return { ok: false, reason: "no_subject" };
  return { ok: true, ...(sub ? { sub } : {}), ...(sid ? { sid } : {}), jti: payload.jti, exp: payload.exp as number };
}
