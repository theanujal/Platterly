import { createHash } from "node:crypto";
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { validateIdentityToken } from "@platterly/platform-contract";
import type { Pool } from "pg";
import { CLIENT_ID, SCOPES, TX_SECONDS, authOrigin, issuer, redirectUri, stubOrigin } from "./config";
import { randomToken, seal, unseal } from "./cookie";
import { createSession } from "./session";

// The stub as an OIDC relying party: authorization code + PKCE (S256) + state + nonce, full ID-token validation BEFORE anything is trusted, and the
// person's email read from the provider's userinfo (the ID token carries identity only). The same shape Caterly will use (F8.1.1).
let jwks: JWTVerifyGetKey | undefined;
/** The provider's signing keys, fetched from its JWKS address and cached; also used to verify back-channel logout tokens. */
export function providerKeys(): JWTVerifyGetKey {
  jwks ??= createRemoteJWKSet(new URL(`${issuer()}/jwks`));
  return jwks;
}

export type Transaction = { state: string; nonce: string; verifier: string; next: string; exp: number };

/** Only a path on this product: never an absolute or protocol-relative address. */
export function safeNext(next: string | null | undefined): string {
  return typeof next === "string" && /^\/(?!\/)[\w\-./?=&%]*$/.test(next) ? next : "/";
}

export function beginSignIn(secret: string, next: string | null | undefined, now: Date = new Date()) {
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken(48);
  const tx: Transaction = { state, nonce, verifier, next: safeNext(next), exp: Math.floor(now.getTime() / 1000) + TX_SECONDS };
  const url = new URL(`${issuer()}/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: SCOPES.join(" "),
    state,
    nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return { authorizeUrl: url.toString(), transaction: seal(tx, secret) };
}

export type CompleteResult =
  | { ok: true; sessionCookie: string; next: string; idToken: string }
  | { ok: false; reason: "bad_transaction" | "state_mismatch" | "provider_error" | "token_exchange_failed" | "invalid_id_token" | "email_not_verified" };

type Fetch = typeof fetch;

export async function completeSignIn(input: { pool: Pool; secret: string; transactionCookie: string | undefined | null; params: URLSearchParams; key?: JWTVerifyGetKey; fetchFn?: Fetch; now?: Date }): Promise<CompleteResult> {
  const now = input.now ?? new Date();
  const doFetch = input.fetchFn ?? fetch;
  const tx = unseal<Transaction>(input.transactionCookie, input.secret);
  if (!tx || typeof tx.exp !== "number" || tx.exp * 1000 <= now.getTime() || ![tx.state, tx.nonce, tx.verifier].every((x) => typeof x === "string")) return { ok: false, reason: "bad_transaction" };
  if (input.params.get("state") !== tx.state) return { ok: false, reason: "state_mismatch" };
  const code = input.params.get("code");
  if (input.params.get("error") || !code) return { ok: false, reason: "provider_error" };
  const iss = input.params.get("iss");
  if (iss && iss !== issuer()) return { ok: false, reason: "provider_error" };

  const tokenResponse = await doFetch(`${issuer()}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: stubOrigin() },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), client_id: CLIENT_ID, code_verifier: tx.verifier }),
  }).catch(() => null);
  if (!tokenResponse?.ok) return { ok: false, reason: "token_exchange_failed" };
  const tokens = (await tokenResponse.json().catch(() => null)) as { id_token?: string; access_token?: string } | null;
  if (!tokens?.id_token || !tokens.access_token) return { ok: false, reason: "token_exchange_failed" };

  const verified = await validateIdentityToken(tokens.id_token, { key: input.key ?? providerKeys(), issuer: issuer(), audience: CLIENT_ID, nonce: tx.nonce, now });
  if (!verified.ok || !verified.claims.sid) return { ok: false, reason: "invalid_id_token" };

  const info = await doFetch(`${issuer()}/oauth2/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } }).catch(() => null);
  const profile = (await info?.json().catch(() => null)) as { sub?: string; email?: string; email_verified?: boolean } | null;
  if (!info?.ok || !profile || profile.sub !== verified.claims.sub || typeof profile.email !== "string") return { ok: false, reason: "invalid_id_token" };
  if (profile.email_verified !== true) return { ok: false, reason: "email_not_verified" };

  const sessionCookie = await createSession(input.pool, input.secret, { sid: verified.claims.sid, sub: verified.claims.sub, email: profile.email, idToken: tokens.id_token }, now);
  return { ok: true, sessionCookie, next: safeNext(tx.next), idToken: tokens.id_token };
}

/** Where sign-out sends the browser: the provider's end-session endpoint, which ends the provider session and calls every product back. */
export function endSessionUrl(idToken: string): string {
  const url = new URL(`${issuer()}/oauth2/end-session`);
  url.search = new URLSearchParams({ id_token_hint: idToken, client_id: CLIENT_ID, post_logout_redirect_uri: `${stubOrigin()}/` }).toString();
  return url.toString();
}
export const providerOrigin = authOrigin;
