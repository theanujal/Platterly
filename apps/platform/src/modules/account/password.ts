import type { Pool } from "pg";
import { PASSWORD } from "../auth/config";
import type { SessionEnder } from "../auth/session-store";

// Change password from the Account. The person must give the CURRENT password (a stolen session alone cannot change it). On success every OTHER
// session of the person ends (this device stays signed in), as the plan requires for a credential change. Guesses of the current password are
// limited per person. Only the credential account's hash is touched; nothing here reads or returns a password.
export type PasswordHasher = { hash(password: string): Promise<string>; verify(input: { hash: string; password: string }): Promise<boolean> };
export type ChangeResult =
  | { ok: true; endedOthers: number }
  | { ok: false; reason: "wrong_password" | "weak" | "same" | "no_password" | "too_many_attempts" };

const WINDOW_MS = 15 * 60_000;
const MAX_WRONG = 5;
const wrong = new Map<string, number[]>();

export function resetPasswordAttempts(): void {
  wrong.clear();
}

export function checkNewPassword(next: unknown): next is string {
  return typeof next === "string" && next.length >= PASSWORD.minLength && next.length <= PASSWORD.maxLength;
}

export async function changePassword(
  pool: Pool,
  hasher: PasswordHasher,
  input: { userId: string; currentSessionId: string; current: unknown; next: unknown },
  ender?: SessionEnder,
  now: number = Date.now(),
): Promise<ChangeResult> {
  const { userId } = input;
  if (typeof input.current !== "string" || !checkNewPassword(input.next)) return { ok: false, reason: "weak" };
  const recent = (wrong.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_WRONG) return { ok: false, reason: "too_many_attempts" };
  const { rows } = await pool.query(`select "id", "password" from "account" where "userId" = $1 and "providerId" = 'credential'`, [userId]);
  const row = rows[0] as { id: string; password: string | null } | undefined;
  if (!row?.password) return { ok: false, reason: "no_password" };
  if (!(await hasher.verify({ hash: row.password, password: input.current }))) {
    wrong.set(userId, [...recent, now]);
    return { ok: false, reason: "wrong_password" };
  }
  wrong.delete(userId);
  if (input.next === input.current) return { ok: false, reason: "same" };
  await pool.query(`update "account" set "password" = $2, "updatedAt" = now() where "id" = $1`, [row.id, await hasher.hash(input.next)]);
  // Every other session ends, through the provider so products holding a token for them are told (F4.2.3).
  const others = (await pool.query('select "token" from "session" where "userId" = $1 and "id" <> $2', [userId, input.currentSessionId])).rows.map((r) => r.token as string);
  if (others.length) {
    if (ender) await ender.deleteSessions(others);
    else await pool.query('delete from "session" where "token" = any($1)', [others]);
  }
  return { ok: true, endedOthers: others.length };
}
