import type { Pool } from "pg";
import { SESSION_SECONDS } from "./config";
import { sign, unsign } from "./cookie";

export type StubSession = { id: string; sid: string; sub: string; email: string; idToken: string; expiresAt: Date };

/** Creates a product session for a provider session. Returns the signed cookie value. */
export async function createSession(pool: Pool, secret: string, input: { sid: string; sub: string; email: string; idToken: string }, now: Date = new Date()): Promise<string> {
  const { rows } = await pool.query(
    `insert into stub_session (sid, sub, email, id_token, expires_at) values ($1, $2, $3, $4, $5) returning id`,
    [input.sid, input.sub, input.email, input.idToken, new Date(now.getTime() + SESSION_SECONDS * 1000)],
  );
  return sign(rows[0].id as string, secret);
}

/** Looks the session up on EVERY request: ending it (sign-out or a back-channel logout) takes effect on the very next request. */
export async function resolveSession(pool: Pool, secret: string, cookie: string | undefined | null, now: Date = new Date()): Promise<StubSession | null> {
  const id = unsign(cookie, secret);
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const { rows } = await pool.query(`select id, sid, sub, email, id_token, expires_at from stub_session where id = $1 and expires_at > $2`, [id, now]);
  const r = rows[0];
  return r ? { id: r.id, sid: r.sid, sub: r.sub, email: r.email, idToken: r.id_token, expiresAt: r.expires_at } : null;
}

export async function endSessionById(pool: Pool, id: string): Promise<void> {
  await pool.query(`delete from stub_session where id = $1`, [id]);
}
/** A back-channel logout names a provider session: only the product sessions made from it end. */
export async function endSessionsBySid(pool: Pool, sid: string): Promise<number> {
  return (await pool.query(`delete from stub_session where sid = $1`, [sid])).rowCount ?? 0;
}
/** A logout token with only a `sub` ends every session of that person in this product. */
export async function endSessionsBySub(pool: Pool, sub: string): Promise<number> {
  return (await pool.query(`delete from stub_session where sub = $1`, [sub])).rowCount ?? 0;
}
