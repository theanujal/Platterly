import type { Pool } from "pg";
import type { Session } from "@/lib/session";
import { ACCOUNT_COOKIE_MAX_AGE, seal, unseal } from "./cookies";
import { findLiveSession, renewSession } from "./session-store";

// The Account's own session (account host, host-only). It is a signed pointer to an identity-provider session, never a copy of one: the cookie holds
// the provider session id (`sid`), the provider's user id (`sub`) and the linked Platform user id (`uid`). Every read re-checks the provider session.
export type AccountCookie = { v: 1; sid: string; sub: string; uid: string; iat: number; exp: number };

export function sealAccountSession(secret: string, c: { sid: string; sub: string; uid: string }, now: Date = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000);
  return seal({ v: 1, ...c, iat, exp: iat + ACCOUNT_COOKIE_MAX_AGE }, secret, "account-session");
}

export function readAccountCookie(value: string | undefined | null, secret: string, now: Date = new Date()): AccountCookie | null {
  const c = unseal<AccountCookie>(value, secret, "account-session");
  if (!c || c.v !== 1 || ![c.sid, c.sub, c.uid].every((x) => typeof x === "string" && x.length > 0) || typeof c.exp !== "number" || typeof c.iat !== "number") return null;
  return c.exp * 1000 > now.getTime() ? c : null;
}

/** The session behind a cookie, or null when the cookie is forged, expired, or its provider session has ended. */
export async function resolveAccountSession(pool: Pool, secret: string, value: string | undefined | null, now: Date = new Date()): Promise<{ session: Session; sid: string; sub: string } | null> {
  const cookie = readAccountCookie(value, secret, now);
  if (!cookie) return null;
  const live = await findLiveSession(pool, cookie.sid, now);
  if (!live || live.userId !== cookie.sub) return null;
  await renewSession(pool, live, now);
  return { session: { userId: cookie.uid, authenticatedAt: live.createdAt }, sid: cookie.sid, sub: cookie.sub };
}
