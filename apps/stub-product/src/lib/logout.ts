import { validateLogoutToken } from "@platterly/platform-contract";
import type { JWTVerifyGetKey } from "jose";
import type { Pool } from "pg";
import { CLIENT_ID, issuer } from "./config";
import { endSessionsBySid, endSessionsBySub } from "./session";

export type LogoutOutcome = { status: 200; ended: number } | { status: 400; error: "invalid_request" | "invalid_token" | "replayed" };

/**
 * The product's back-channel logout endpoint (OIDC Back-Channel Logout 1.0). The body is form-encoded `logout_token=<jwt>`. Nothing happens until the token
 * passes `validateLogoutToken` (signature from the provider's keys, issuer, THIS product's audience, `logout+jwt` type, event, no nonce, jti, sub or sid).
 * A jti is accepted once. A token naming a session ends only the product sessions made from that provider session; one naming only a person ends all
 * of that person's sessions here.
 */
export async function handleBackchannelLogout(input: { pool: Pool; body: string; key: JWTVerifyGetKey; now?: Date }): Promise<LogoutOutcome> {
  const now = input.now ?? new Date();
  const token = new URLSearchParams(input.body).get("logout_token");
  if (!token) return { status: 400, error: "invalid_request" };
  const result = await validateLogoutToken(token, { key: input.key, issuer: issuer(), audience: CLIENT_ID, now });
  if (!result.ok) return { status: 400, error: "invalid_token" };
  // Replay guard: forget old jtis, then remember this one; if it was already there the token was used before.
  await input.pool.query(`delete from stub_logout_jti where expires_at < $1`, [now]);
  const first = await input.pool.query(`insert into stub_logout_jti (jti, expires_at) values ($1, $2) on conflict (jti) do nothing`, [result.jti, new Date(result.exp * 1000 + 60_000)]);
  if (first.rowCount !== 1) return { status: 400, error: "replayed" };
  const ended = result.sid ? await endSessionsBySid(input.pool, result.sid) : await endSessionsBySub(input.pool, result.sub as string);
  return { status: 200, ended };
}
