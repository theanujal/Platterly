import type { Pool } from "pg";
import { isLockedOut, noteRight, noteWrong } from "./password-attempts";
import type { PasswordHasher } from "./password";

/** Re-checks the person's current password for a sensitive action (download my data, request deletion), with the same wrong-guess limit as a password change. */
export async function confirmPassword(pool: Pool, hasher: PasswordHasher, userId: string, password: unknown, now: number = Date.now()): Promise<"ok" | "wrong_password" | "no_password" | "too_many_attempts"> {
  if (typeof password !== "string" || !password) return "wrong_password";
  if (isLockedOut(userId, now)) return "too_many_attempts";
  const { rows } = await pool.query(`select "password" from "account" where "userId" = $1 and "providerId" = 'credential'`, [userId]);
  const hash = rows[0]?.password as string | null | undefined;
  if (!hash) return "no_password";
  if (!(await hasher.verify({ hash, password }))) {
    noteWrong(userId, now);
    return "wrong_password";
  }
  noteRight(userId);
  return "ok";
}
