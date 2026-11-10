import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";

// Change of sign-in email with safeguards (plan R11-9, reshaped by AJ 2026-11-10): the current password and, when it is on, the two-step code (both checked by the
// route), a code sent to the NEW address, and a notice with a cancel link to the OLD address that works for 24 hours. Cancelling needs a reason, puts the old email
// back, and puts the account on hold until Ops verifies the person (see hold.ts). A code that is never entered changes nothing; the old address is told once
// (`claimExpiredNotices`). There is no hold on other actions. Only hashes of the code and the cancel token are
// stored. The Platform's own copy of the email is changed in the same step through `sync`, inside the identity transaction, so the two never disagree:
// if `sync` fails the identity change is rolled back. Every query is scoped to the person (by id, or by the secret cancel token).
export const CODE_MINUTES = 10;
export const MAX_TRIES = 5;
export const RESEND_SECONDS = 55;
/** How long the old address can cancel a completed change (stored in the column "holdUntil", which now means "cancel until"). */
export const CANCEL_HOURS = 24;

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
export const normaliseEmail = (e: string) => e.trim().toLowerCase();
const mac = (secret: string, purpose: string, value: string) => createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export type Sync = (change: { userId: string; from: string; to: string }) => Promise<void>;
export type StartResult = { ok: true; code: string; to: string } | { ok: false; reason: "invalid" | "same" | "unavailable" | "too_soon" };
export type ConfirmOk = { ok: true; oldEmail: string; newEmail: string; cancelToken: string; cancelUntil: Date };
export type ConfirmResult = ConfirmOk | { ok: false; reason: "wrong_code" | "expired" | "too_many_tries" | "nothing_pending" | "unavailable" };
export type CancelReason = { code: "not_me" | "mistake" | "other"; note: string };
export type CancelResult = { ok: true; userId: string; reviewId: string; restoredEmail: string; newEmail: string; requestedAt: Date } | { ok: false; reason: "invalid" | "expired" | "already_cancelled" | "unavailable" | "reason_required" };

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
    const holdUntil = new Date(now.getTime() + CANCEL_HOURS * 3_600_000);
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
    return { ok: true, oldEmail, newEmail, cancelToken, cancelUntil: holdUntil };
  } finally {
    client.release();
  }
}

/**
 * The old address used the cancel link. Valid only while the 24-hour window is open, and only with a reason. Restores the old email in both places and, in the same
 * transaction, puts the account on hold (accountHold) until Ops verifies the person.
 */
export async function cancelChange(pool: Pool, secret: string, token: unknown, why: unknown, sync: Sync, now: Date = new Date()): Promise<CancelResult> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return { ok: false, reason: "invalid" };
  const code = (why as { code?: unknown } | null)?.code;
  const note = typeof (why as { note?: unknown } | null)?.note === "string" ? ((why as { note: string }).note).trim() : "";
  if ((code !== "not_me" && code !== "mistake" && code !== "other") || note.length > 500 || (code === "other" && note.length === 0)) return { ok: false, reason: "reason_required" };
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
    await client.query(`update "emailChange" set "status" = 'cancelled', "cancelledAt" = $2, "holdUntil" = null, "cancelReason" = $3, "cancelNote" = $4 where "id" = $1`, [row.id, now, code, note]);
    await client.query(`insert into "accountHold" ("userId", "reviewId", "reason", "createdAt") values ($1, $2, $3, $4)
      on conflict ("userId") do update set "reviewId" = excluded."reviewId", "reason" = excluded."reason", "createdAt" = excluded."createdAt", "opsNotifiedAt" = null, "liftedAt" = null`, [userId, row.id, code, now]);
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
    return { ok: true, userId, reviewId: row.id as string, restoredEmail: oldEmail, newEmail, requestedAt: now };
  } finally {
    client.release();
  }
}

/**
 * Pending changes whose code ran out (or was tried too often) without being completed, that the old address has not been told about yet. Each is claimed in
 * one statement, so two callers never both send the notice. Nothing was changed; the old address is told that someone tried. `userId` limits it to one person.
 */
export async function claimExpiredNotices(pool: Pool, now: Date = new Date(), userId?: string): Promise<{ oldEmail: string; newEmail: string }[]> {
  const { rows } = await pool.query(
    `update "emailChange" set "noticeSentAt" = $1 where "status" = 'pending' and "noticeSentAt" is null and "codeExpiresAt" <= $1 and ($2::text is null or "userId" = $2) returning "oldEmail", "newEmail"`,
    [now, userId ?? null],
  );
  return rows.map((r) => ({ oldEmail: r.oldEmail as string, newEmail: r.newEmail as string }));
}

export async function pendingChange(pool: Pool, userId: string, now: Date = new Date()): Promise<{ newEmail: string } | null> {
  const { rows } = await pool.query(`select "newEmail" from "emailChange" where "userId" = $1 and "status" = 'pending' and "codeExpiresAt" > $2`, [userId, now]);
  return rows[0] ? { newEmail: rows[0].newEmail as string } : null;
}
