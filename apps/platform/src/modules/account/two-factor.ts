import { serializeSignedCookie } from "better-call";
import type { Pool } from "pg";
import type { Idp } from "../auth/idp";

// Two-step verification from the Account. The Account has its own session cookie, but the provider's two-factor endpoints want the provider's session
// cookie, which lives on the auth host only. So the Account (the same app) presents the provider session the verified Account session points at, by building
// the provider's signed session cookie for it in a server-side call. Nothing is sent to the browser. Every call is for the caller's own session only.
export async function providerSessionHeaders(provider: Idp, pool: Pool, providerSessionId: string, userId: string): Promise<Headers | null> {
  const { rows } = await pool.query('select "token" from "session" where "id" = $1 and "userId" = $2', [providerSessionId, userId]);
  const token = rows[0]?.token as string | undefined;
  if (!token) return null;
  const context = await provider.$context;
  const signed = await serializeSignedCookie(context.authCookies.sessionToken.name, token, context.secret);
  return new Headers({ cookie: signed.split(";")[0], origin: context.baseURL });
}

export type TwoFactorStatus = { enabled: boolean };

export async function twoFactorStatus(pool: Pool, userId: string): Promise<TwoFactorStatus> {
  const { rows } = await pool.query('select "twoFactorEnabled" from "user" where "id" = $1', [userId]);
  return { enabled: rows[0]?.twoFactorEnabled === true };
}

/** Reads the new provider session's id out of a response's Set-Cookie headers (the provider replaces the session when two-step verification is switched on). */
export async function newSessionIdFrom(provider: Idp, pool: Pool, setCookie: string[]): Promise<string | null> {
  const name = (await provider.$context).authCookies.sessionToken.name;
  for (const line of setCookie) {
    const pair = line.split(";")[0];
    if (!pair.startsWith(`${name}=`)) continue;
    const token = decodeURIComponent(pair.slice(name.length + 1)).split(".")[0];
    const { rows } = await pool.query('select "id" from "session" where "token" = $1', [token]);
    if (rows[0]) return rows[0].id as string;
  }
  return null;
}
