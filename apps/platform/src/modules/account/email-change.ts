import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";

// Change of sign-in email with safeguards (plan R11-9): the current password (checked by the route), a code sent to the NEW address, a notice with a
// cancel link to the OLD address that works for 72 hours, and a hold on risky actions for those 72 hours. Only hashes of the code and the cancel token are
// stored. The Platform's own copy of the email is changed in the same step through `sync`, inside the identity transaction, so the two never disagree:
// if `sync` fails the identity change is rolled back. Every query is scoped to the person (by id, or by the secret cancel token).
export const CODE_MINUTES = 10;
export const MAX_TRIES = 5;
export const RESEND_SECONDS = 55;
export const HOLD_HOURS = 72;

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
export const normaliseEmail = (e: string) => e.trim().toLowerCase();
const mac = (secret: string, purpose: string, value: string) => createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export type Sync = (change: { userId: string; from: string; to: string }) => Promise<void>;
export type StartResult = { ok: true; code: string; to: string } | { ok: false; reason: "invalid" | "same" | "unavailable" | "too_soon" };
export type ConfirmOk = { ok: true; oldEmail: string; newEmail: string; cancelToken: string; holdUntil: Date };
export type ConfirmResult = ConfirmOk | { ok: false; reason: "wrong_code" | "expired" | "too_many_tries" | "nothing_pending" | "unavailable" };
export type CancelResult = { ok: true; userId: string; restoredEmail: string; newEmail: string } | { ok: false; reason: "invalid" | "expired" | "already_cancelled" | "unavailable" };

export async function startChange(pool: Pool, secret: string, user: { id: string; email: string }, input: unknown, now: Date = new Date()): Promise<StartResult> {
  const email = typeof input === "string" ? normaliseEmail(input) : "";
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, reason: "invalid" };
  if (email === normaliseEmail(user.email)) return { ok: false, reason: "same" };
  // One answer for "someone already has this address" and for any other refusal of the address: it must not tell who has an account.
  const taken = await pool.query('select 1 from "user" where lower("email") = $1 and "id" <> $2', [email, user.id]);
  if (taken.rowCount) return { ok: false, reason: "unavailable" };
  const last = (await pool.query(`select max("sentAt") as "at" from "emailChange" where "userId" = $1 and "status" = 'pending'`, [user.id])).rows[0]?.at as Date | null | undefined;
  if (last && now.getTime() - last.getTime() < RESEND_SECONDS * 1000) return { ok: false, reason: "too_soon" };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await pool.query(`delete from "emailChange" where "userId" = $1 and "status" = 'pending'`, [user.id]);
  await pool.query(
    `insert into "emailChange" ("id", "userId", "oldEmail", "newEmail", "status", "codeHash", "codeExpiresAt", "sentAt") values ($1, $2, $3, $4, 'pending', $5, $6, $7)`,
    [randomUUID(), user.id, user.email, email, mac(secret, `email-change:${user.id}`, code), new Date(now.getTime() + CODE_MINUTES * 60_000), now],
  );
  return { ok: true, code, to: email };
}

export async function confirmChange(pool: Pool, secret: string, userId: string, code: unknown, sync: Sync, now: Date = new Date()): Promise<ConfirmResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const row = (await client.query(`select * from "emailChange" where "userId" = $1 and "status" = 'pending' for update`, [userId])).rows[0];
    if (!row) {
      await client.query("rollback");
      return { ok: false, reason: "nothing_pending" };
    }
    if ((row.codeExpiresAt as Date) <= now) {
      await client.query("rollback");
      return { ok: false, reason: "expired" };
    }
    if ((row.attempts as number) >= MAX_TRIES) {
      await client.query("rollback");
      return { ok: false, reason: "too_many_tries" };
    }
    if (!same(mac(secret, `email-change:${userId}`, typeof code === "string" ? code.trim() : ""), row.codeHash as string)) {
      await client.query(`update "emailChange" set "attempts" = "attempts" + 1 where "id" = $1`, [row.id]);
      await client.query("commit");
      return { ok: false, reason: "wrong_code" };
    }
    const newEmail = row.newEmail as string;
    const oldEmail = (await client.query('select "email" from "user" where "id" = $1', [userId])).rows[0]?.email as string | undefined;
    if (!oldEmail || (await client.query('select 1 from "user" where lower("email") = $1 and "id" <> $2', [newEmail, userId])).rowCount) {
      await client.query("rollback");
      return { ok: false, reason: "unavailable" };
    }
    const cancelToken = randomBytes(32).toString("base64url");
    const holdUntil = new Date(now.getTime() + HOLD_HOURS * 3_600_000);
    await client.query('update "user" set "email" = $2, "emailVerified" = true, "updatedAt" = $3 where "id" = $1', [userId, newEmail, now]);
    // A recovery email that is now the main email is dropped (it must differ from the main one).
    await client.query(`delete from "recoveryEmail" where "userId" = $1 and lower("email") = $2`, [userId, newEmail]);
    await client.query(`update "emailChange" set "status" = 'completed', "oldEmail" = $2, "codeHash" = null, "cancelTokenHash" = $3, "holdUntil" = $4, "completedAt" = $5 where "id" = $1`, [row.id, oldEmail, mac(secret, "email-change-cancel", cancelToken), holdUntil, now]);
    try {
      await sync({ userId, from: oldEmail, to: newEmail });
    } catch {
      await client.query("rollback");
      return { ok: false, reason: "unavailable" };
    }
    try {
      await client.query("commit");
    } catch (error) {
      // The Platform copy already changed: put it back so the two stay equal, then report the failure.
      await sync({ userId, from: newEmail, to: oldEmail }).catch(() => undefined);
      throw error;
    }
    return { ok: true, oldEmail, newEmail, cancelToken, holdUntil };
  } finally {
    client.release();
  }
}

/** The old address used the cancel link. Valid only while the 72-hour window is open. Restores the old email in both places. */
export async function cancelChange(pool: Pool, secret: string, token: unknown, sync: Sync, now: Date = new Date()): Promise<CancelResult> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return { ok: false, reason: "invalid" };
  const client = await pool.connect();
  try {
    await client.query("begin");
    const row = (await client.query(`select * from "emailChange" where "cancelTokenHash" = $1 for update`, [mac(secret, "email-change-cancel", token)])).rows[0];
    if (!row) {
      await client.query("rollback");
      return { ok: false, reason: "invalid" };
    }
    if (row.status === "cancelled") {
      await client.query("rollback");
      return { ok: false, reason: "already_cancelled" };
    }
    if ((row.holdUntil as Date) <= now) {
      await client.query("rollback");
      return { ok: false, reason: "expired" };
    }
    const userId = row.userId as string;
    const oldEmail = row.oldEmail as string;
    const newEmail = row.newEmail as string;
    if ((await client.query('select 1 from "user" where lower("email") = $1 and "id" <> $2', [normaliseEmail(oldEmail), userId])).rowCount) {
      await client.query("rollback");
      return { ok: false, reason: "unavailable" };
    }
    await client.query('update "user" set "email" = $2, "updatedAt" = $3 where "id" = $1', [userId, oldEmail, now]);
    await client.query(`update "emailChange" set "status" = 'cancelled', "cancelledAt" = $2, "holdUntil" = null where "id" = $1`, [row.id, now]);
    try {
      await sync({ userId, from: newEmail, to: oldEmail });
    } catch {
      await client.query("rollback");
      return { ok: false, reason: "unavailable" };
    }
    try {
      await client.query("commit");
    } catch (error) {
      await sync({ userId, from: oldEmail, to: newEmail }).catch(() => undefined);
      throw error;
    }
    return { ok: true, userId, restoredEmail: oldEmail, newEmail };
  } finally {
    client.release();
  }
}

/** Whether the person's 72-hour window is open. Features that must hold risky actions (ownership transfer, claims, billing contact) ask this. */
export async function emailChangeHold(pool: Pool, userId: string, now: Date = new Date()): Promise<{ until: string } | null> {
  const { rows } = await pool.query(`select "holdUntil" from "emailChange" where "userId" = $1 and "status" = 'completed' and "holdUntil" > $2 order by "holdUntil" desc limit 1`, [userId, now]);
  return rows[0] ? { until: (rows[0].holdUntil as Date).toISOString() } : null;
}

export async function pendingChange(pool: Pool, userId: string, now: Date = new Date()): Promise<{ newEmail: string } | null> {
  const { rows } = await pool.query(`select "newEmail" from "emailChange" where "userId" = $1 and "status" = 'pending' and "codeExpiresAt" > $2`, [userId, now]);
  return rows[0] ? { newEmail: rows[0].newEmail as string } : null;
}
