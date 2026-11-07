import type { Pool } from "pg";
import { SESSION_POLICY } from "./config";

// Reads and ends identity-provider sessions straight from the identity database (the Account and the provider are one app). This is what keeps
// revocation immediate: there is no cookie cache, so every Account request asks the session table whether the session is still alive (D2).
export type IdpSession = { id: string; userId: string; expiresAt: Date; createdAt: Date; updatedAt: Date };

export async function findLiveSession(pool: Pool, sid: string, now: Date = new Date()): Promise<IdpSession | null> {
  const { rows } = await pool.query('select "id", "userId", "expiresAt", "createdAt", "updatedAt" from "session" where "id" = $1', [sid]);
  const row = rows[0] as IdpSession | undefined;
  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime()) return null; // idle expiry
  if (row.createdAt.getTime() + SESSION_POLICY.absoluteSeconds * 1000 <= now.getTime()) return null; // absolute expiry
  return row;
}

/** Idle renewal: pushes the idle expiry forward, at most once per `updateAgeSeconds`. */
export async function renewSession(pool: Pool, session: IdpSession, now: Date = new Date()): Promise<void> {
  if (now.getTime() - session.updatedAt.getTime() < SESSION_POLICY.updateAgeSeconds * 1000) return;
  const idleUntil = new Date(now.getTime() + SESSION_POLICY.idleSeconds * 1000);
  const absoluteEnd = new Date(session.createdAt.getTime() + SESSION_POLICY.absoluteSeconds * 1000);
  await pool.query('update "session" set "expiresAt" = $2, "updatedAt" = $3 where "id" = $1', [session.id, idleUntil < absoluteEnd ? idleUntil : absoluteEnd, now]);
}

/**
 * How a session is deleted so the provider's own delete hooks run. A raw `delete from "session"` skips them, and then no product is told (F4.2.3):
 * the provider sends each registered product a signed back-channel logout token only when the session goes through its adapter. Pass
 * `(await idp().$context).internalAdapter`. Without one the row is deleted directly (tests of the session table alone).
 */
export type SessionEnder = { deleteSession(token: string): Promise<unknown>; deleteSessions(tokens: string[]): Promise<unknown> };

/** Ends one session (sign out). Scoped to its owner so a caller can only end their own. */
export async function endSession(pool: Pool, sid: string, userId: string, ender?: SessionEnder): Promise<boolean> {
  if (!ender) {
    const { rowCount } = await pool.query('delete from "session" where "id" = $1 and "userId" = $2', [sid, userId]);
    return rowCount === 1;
  }
  const { rows } = await pool.query('select "token" from "session" where "id" = $1 and "userId" = $2', [sid, userId]);
  if (rows.length !== 1) return false;
  await ender.deleteSession(rows[0].token as string);
  return true;
}

export type DeviceRow = { id: string; userAgent: string | null; updatedAt: Date; createdAt: Date };

/** The person's own live sessions, newest activity first (F4.3.1). Expired sessions (idle or absolute) are not listed. */
export async function listLiveSessions(pool: Pool, userId: string, now: Date = new Date()): Promise<DeviceRow[]> {
  const { rows } = await pool.query(
    'select "id", "userAgent", "updatedAt", "createdAt" from "session" where "userId" = $1 and "expiresAt" > $2 and "createdAt" > $3 order by "updatedAt" desc',
    [userId, now, new Date(now.getTime() - SESSION_POLICY.absoluteSeconds * 1000)],
  );
  return rows as DeviceRow[];
}

/** Ends every session of one person (sign out everywhere). Returns how many ended. */
export async function endAllSessions(pool: Pool, userId: string, ender?: SessionEnder): Promise<number> {
  if (!ender) {
    const { rowCount } = await pool.query('delete from "session" where "userId" = $1', [userId]);
    return rowCount ?? 0;
  }
  const { rows } = await pool.query('select "token" from "session" where "userId" = $1', [userId]);
  if (rows.length === 0) return 0;
  await ender.deleteSessions(rows.map((r) => r.token as string));
  return rows.length;
}
