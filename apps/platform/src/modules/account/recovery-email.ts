import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";

// Recovery email: a second, verified address that can receive a password-reset code when the main email cannot be reached. It is used ONLY for password
// reset (not for two-step verification). It must differ from the main email. Adding or changing one is confirmed by a code sent to the new address;
// only a hash of that code is stored, it expires in 10 minutes, allows 5 wrong tries, and can be re-sent after 55 seconds. Every query is scoped to the
// caller's own provider user id.
export const CODE_MINUTES = 10;
export const MAX_TRIES = 5;
export const RESEND_SECONDS = 55;

/** While set, the provider's next one-time code mail goes to this address instead of the person's main email (used only by the recovery reset route). */
// Kept on globalThis so the route that sets it and the provider that reads it share ONE store even when the bundler gives each its own copy of this module.
declare global {
  var __recoveryDelivery: AsyncLocalStorage<{ to: string }> | undefined;
}
export const recoveryDelivery: AsyncLocalStorage<{ to: string }> = (globalThis.__recoveryDelivery ??= new AsyncLocalStorage<{ to: string }>());

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const norm = (e: string) => e.trim().toLowerCase();
const hash = (secret: string, userId: string, code: string) => createHmac("sha256", secret).update(`recovery:${userId}:${code}`).digest("hex");

export type RecoveryView = { email: string | null; pendingEmail: string | null };
export type StartResult = { ok: true; code: string; to: string } | { ok: false; reason: "invalid" | "same_as_main" | "too_soon" };
export type ConfirmResult = "ok" | "wrong_code" | "expired" | "too_many_tries" | "nothing_pending";

export async function getRecovery(pool: Pool, userId: string, now: Date = new Date()): Promise<RecoveryView> {
  const { rows } = await pool.query('select "email", "verifiedAt", "pendingEmail", "pendingExpiresAt" from "recoveryEmail" where "userId" = $1', [userId]);
  const r = rows[0];
  const pending = r?.pendingEmail && r.pendingExpiresAt && (r.pendingExpiresAt as Date) > now ? (r.pendingEmail as string) : null;
  return { email: r?.verifiedAt ? (r.email as string) : null, pendingEmail: pending };
}

/** Starts adding or changing the recovery email. Returns the code to mail; the caller sends it. Nothing in use changes until the code is confirmed. */
export async function startRecovery(pool: Pool, secret: string, userId: string, mainEmail: string, input: unknown, now: Date = new Date()): Promise<StartResult> {
  const email = typeof input === "string" ? norm(input) : "";
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, reason: "invalid" };
  if (email === norm(mainEmail)) return { ok: false, reason: "same_as_main" };
  const { rows } = await pool.query('select "pendingSentAt" from "recoveryEmail" where "userId" = $1', [userId]);
  const sent = rows[0]?.pendingSentAt as Date | null | undefined;
  if (sent && now.getTime() - sent.getTime() < RESEND_SECONDS * 1000) return { ok: false, reason: "too_soon" };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await pool.query(
    `insert into "recoveryEmail" ("userId", "pendingEmail", "pendingCodeHash", "pendingExpiresAt", "pendingAttempts", "pendingSentAt", "updatedAt") values ($1, $2, $3, $4, 0, $5, $5)
     on conflict ("userId") do update set "pendingEmail" = $2, "pendingCodeHash" = $3, "pendingExpiresAt" = $4, "pendingAttempts" = 0, "pendingSentAt" = $5, "updatedAt" = $5`,
    [userId, email, hash(secret, userId, code), new Date(now.getTime() + CODE_MINUTES * 60_000), now],
  );
  return { ok: true, code, to: email };
}

export async function confirmRecovery(pool: Pool, secret: string, userId: string, code: unknown, now: Date = new Date()): Promise<ConfirmResult> {
  const { rows } = await pool.query('select "pendingEmail", "pendingCodeHash", "pendingExpiresAt", "pendingAttempts" from "recoveryEmail" where "userId" = $1', [userId]);
  const r = rows[0];
  if (!r?.pendingEmail || !r.pendingCodeHash) return "nothing_pending";
  if ((r.pendingExpiresAt as Date) <= now) return "expired";
  if ((r.pendingAttempts as number) >= MAX_TRIES) return "too_many_tries";
  const given = Buffer.from(hash(secret, userId, typeof code === "string" ? code.trim() : ""));
  const wanted = Buffer.from(r.pendingCodeHash as string);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    await pool.query('update "recoveryEmail" set "pendingAttempts" = "pendingAttempts" + 1 where "userId" = $1', [userId]);
    return "wrong_code";
  }
  await pool.query(
    `update "recoveryEmail" set "email" = "pendingEmail", "verifiedAt" = $2, "pendingEmail" = null, "pendingCodeHash" = null, "pendingExpiresAt" = null, "pendingAttempts" = 0, "updatedAt" = $2 where "userId" = $1`,
    [userId, now],
  );
  return "ok";
}

export async function removeRecovery(pool: Pool, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query('delete from "recoveryEmail" where "userId" = $1', [userId]);
  return rowCount === 1;
}

/** The verified recovery address of the person whose MAIN email this is, or null. Used by the reset route; its answer to the caller never depends on this. */
export async function recoveryAddressFor(pool: Pool, mainEmail: string): Promise<{ userId: string; to: string } | null> {
  const { rows } = await pool.query(
    'select r."userId", r."email" from "recoveryEmail" r join "user" u on u."id" = r."userId" where lower(u."email") = $1 and r."verifiedAt" is not null and r."email" is not null',
    [norm(mainEmail)],
  );
  return rows[0] ? { userId: rows[0].userId as string, to: rows[0].email as string } : null;
}
