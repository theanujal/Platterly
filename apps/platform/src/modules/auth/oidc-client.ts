import { createHash, timingSafeEqual } from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";
import { findOrCreateBySubject, type IdentityLinkClient } from "../users/identity-link";
import { mintProviderEmailAssertion } from "../users/provider-assertion";
import { ACCOUNT_SCOPES, IDP_PROVIDER, SURFACES, authOrigin, safeNextPath, type Surface } from "./config";
import { randomToken, seal, unseal } from "./cookies";

// The Account as a first-party OIDC client (F7.1.1 / F4.2.2): authorization-code flow with PKCE (S256), state, nonce, and full ID-token validation
// (signature from the provider's own JWKS, issuer, audience, expiry, nonce) BEFORE anything is trusted. Only then is the verified email turned into
// the identity-link assertion (`mintProviderEmailAssertion` is called here and nowhere else in production). The provider is called in-process.
export type IdpHandler = (request: Request) => Promise<Response>;
const ISSUER = () => `${authOrigin()}/api/auth`;
const TX_SECONDS = 600;

export type Transaction = { state: string; nonce: string; verifier: string; next: string; exp: number };

export function beginSignIn(secret: string, nextPath: string | null | undefined, now: Date = new Date(), surface: Surface = "account") {
  const { clientId, redirectUri } = SURFACES[surface];
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const next = safeNextPath(nextPath);
  const tx: Transaction = { state, nonce, verifier, next, exp: Math.floor(now.getTime() / 1000) + TX_SECONDS };
  const url = new URL(`${ISSUER()}/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri(),
    scope: ACCOUNT_SCOPES.join(" "),
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { authorizeUrl: url.toString(), transaction: seal(tx, secret, "oidc-transaction") };
}

export type CompleteResult =
  | { ok: true; sid: string; sub: string; userId: string; next: string; created: boolean }
  | { ok: false; reason: "bad_transaction" | "state_mismatch" | "provider_error" | "token_exchange_failed" | "invalid_id_token" | "email_not_verified" | "link_refused" };

const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function completeSignIn(
  input: { secret: string; transactionCookie: string | undefined | null; params: URLSearchParams; handler: IdpHandler; now?: Date; linkClient?: IdentityLinkClient; surface?: Surface },
): Promise<CompleteResult> {
  const now = input.now ?? new Date();
  const { clientId, redirectUri } = SURFACES[input.surface ?? "account"];
  const tx = unseal<Transaction>(input.transactionCookie, input.secret, "oidc-transaction");
  if (!tx || typeof tx.exp !== "number" || tx.exp * 1000 <= now.getTime() || ![tx.state, tx.nonce, tx.verifier].every((x) => typeof x === "string")) return { ok: false, reason: "bad_transaction" };
  const state = input.params.get("state");
  if (!state || !equal(state, tx.state)) return { ok: false, reason: "state_mismatch" };
  const code = input.params.get("code");
  if (input.params.get("error") || !code) return { ok: false, reason: "provider_error" };
  // A provider that names itself in `iss` must be this one.
  const iss = input.params.get("iss");
  if (iss && iss !== ISSUER()) return { ok: false, reason: "provider_error" };

  const tokenResponse = await input.handler(
    new Request(`${ISSUER()}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: new URL(redirectUri()).origin },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), client_id: clientId, code_verifier: tx.verifier }),
    }),
  );
  if (!tokenResponse.ok) return { ok: false, reason: "token_exchange_failed" };
  const tokens = (await tokenResponse.json().catch(() => null)) as { id_token?: string; access_token?: string } | null;
  if (!tokens?.id_token || !tokens.access_token) return { ok: false, reason: "token_exchange_failed" };

  let claims: { sub?: string; sid?: string; nonce?: string };
  try {
    const jwksResponse = await input.handler(new Request(`${ISSUER()}/jwks`));
    const jwks = createLocalJWKSet((await jwksResponse.json()) as Parameters<typeof createLocalJWKSet>[0]);
    const verified = await jwtVerify(tokens.id_token, jwks, { issuer: ISSUER(), audience: clientId, algorithms: ["EdDSA", "RS256", "ES256"], currentDate: now });
    claims = verified.payload as typeof claims;
  } catch {
    return { ok: false, reason: "invalid_id_token" };
  }
  if (!claims.sub || !claims.sid || !claims.nonce || !equal(claims.nonce, tx.nonce)) return { ok: false, reason: "invalid_id_token" };

  // The verified email comes from the provider's own userinfo endpoint, and must belong to the same subject.
  const info = await input.handler(new Request(`${ISSUER()}/oauth2/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } }));
  const profile = (await info.json().catch(() => null)) as { sub?: string; email?: string; email_verified?: boolean } | null;
  if (!info.ok || !profile || profile.sub !== claims.sub || typeof profile.email !== "string") return { ok: false, reason: "invalid_id_token" };
  if (profile.email_verified !== true) return { ok: false, reason: "email_not_verified" };

  // Everything above is trusted-provider validation. Only now is the assertion minted.
  const linked = await findOrCreateBySubject({
    provider: IDP_PROVIDER,
    subject: claims.sub,
    email: profile.email,
    emailAssertion: mintProviderEmailAssertion({ provider: IDP_PROVIDER, subject: claims.sub, email: profile.email }),
  }, input.linkClient);
  if (!linked.ok) return { ok: false, reason: "link_refused" };
  return { ok: true, sid: claims.sid, sub: claims.sub, userId: linked.user.id, next: safeNextPath(tx.next), created: linked.created };
}
