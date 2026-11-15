import { PLATFORM_ACCOUNT_DELETION_PATH, PLATFORM_ACCOUNT_DELETION_STATUS_PATH, PLATFORM_ACCOUNT_DELETION_WITHDRAW_PATH, parseAccountDeletionRequest } from "@platterly/contract";
import type { Pool } from "pg";
import { deletionApprovedEmail, deletionDeclinedEmail, deletionRestoredEmail } from "../auth/email-templates";
import { sendAuthEmail } from "../auth/mailer";
import { opsPost } from "./hold";
import { getProfile } from "./profile";

// Account deletion requests, Platform side (AJ, 2026-11-15). The person asks on My Profile; Ops staff decide; this module tells Ops (and tells it again if Ops was
// down), asks Ops for the decision (so Ops never calls the Platform) and acts on it:
//   approved  -> every session of the person ends and they cannot sign in (see `isDeletionApproved`), and they are emailed;
//   declined  -> the request closes with the reason, and they are emailed;
//   restored  -> staff changed their mind during the retention period: sign-in works again, and they are emailed.
// Each transition is claimed in one UPDATE, so its email goes out once however many times this runs.
type Deps = { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now?: number; sendEmail?: typeof sendAuthEmail };
export const RETENTION_DAYS = 30;

/** Whether the person's deletion was approved, which blocks signing in until staff restore it. */
export async function isDeletionApproved(pool: Pick<Pool, "query">, userId: string): Promise<boolean> {
  const { rows } = await pool.query(`select 1 from "deletionRequest" where "userId" = $1 and "status" = 'approved' limit 1`, [userId]);
  return rows.length > 0;
}

/** Tells Ops about one request (once; Ops treats a repeat as nothing new) and remembers that it was told. */
export async function sendRequestToOps(pool: Pool, requestId: string, deps: Deps = {}): Promise<boolean> {
  const { rows } = await pool.query(`select "opsPayload" from "deletionRequest" where "id" = $1 and "status" = 'pending' and "opsNotifiedAt" is null`, [requestId]);
  const payload = rows[0]?.opsPayload;
  if (!payload || !parseAccountDeletionRequest(payload).ok) return false;
  const got = await opsPost(PLATFORM_ACCOUNT_DELETION_PATH, payload, deps);
  if (!got.ok) return false;
  await pool.query(`update "deletionRequest" set "opsNotifiedAt" = now() where "id" = $1 and "opsNotifiedAt" is null`, [requestId]);
  return true;
}

/** The person withdrew a pending request: Ops is told so staff stop looking at it. */
export async function sendWithdrawalToOps(pool: Pool, requestId: string, deps: Deps = {}): Promise<boolean> {
  const got = await opsPost(PLATFORM_ACCOUNT_DELETION_WITHDRAW_PATH, { requestId }, deps);
  if (!got.ok) return got.reason === "unknown" ? await markWithdrawn(pool, requestId) : false;
  return markWithdrawn(pool, requestId);
}
const markWithdrawn = async (pool: Pool, requestId: string) => {
  await pool.query(`update "deletionRequest" set "withdrawNotifiedAt" = now() where "id" = $1`, [requestId]);
  return true;
};

async function emailPerson(pool: Pool, userId: string, mail: ReturnType<typeof deletionApprovedEmail>, deps: Deps) {
  try {
    const profile = await getProfile(pool, userId);
    if (profile) await (deps.sendEmail ?? sendAuthEmail)({ to: profile.email, ...mail });
  } catch (error) {
    console.error("deletion decision email failed", error instanceof Error ? error.message : "unknown");
  }
}

/**
 * One pass: tell Ops about requests it has not heard of, tell it about withdrawals, then ask it for the decision on every open request and act on a change.
 * `userId` limits the pass to one person (used when that person opens their Profile or tries to sign in).
 */
export async function syncDeletionRequests(pool: Pool, deps: Deps = {}, userId?: string): Promise<{ sent: number; decided: number }> {
  const scope = userId ? ` and "userId" = $1` : "";
  const args = userId ? [userId] : [];
  let sent = 0;
  let decided = 0;

  const unsent = await pool.query(`select "id" from "deletionRequest" where "status" = 'pending' and "opsNotifiedAt" is null${scope}`, args);
  for (const r of unsent.rows) if (await sendRequestToOps(pool, r.id, deps)) sent += 1;

  const withdrawn = await pool.query(`select "id" from "deletionRequest" where "status" = 'cancelled' and "opsNotifiedAt" is not null and "withdrawNotifiedAt" is null${scope}`, args);
  for (const r of withdrawn.rows) await sendWithdrawalToOps(pool, r.id, deps);

  const open = await pool.query(`select "id", "userId", "status" from "deletionRequest" where "status" in ('pending', 'approved') and "opsNotifiedAt" is not null${scope}`, args);
  for (const r of open.rows as { id: string; userId: string; status: string }[]) {
    const got = await opsPost(PLATFORM_ACCOUNT_DELETION_STATUS_PATH, { requestId: r.id }, deps);
    if (!got.ok) continue;
    const ops = got.value.status;
    if (r.status === "pending" && ops === "DECLINED") {
      const reason = typeof got.value.declineReason === "string" ? got.value.declineReason : "Our team could not go ahead with it.";
      const done = await pool.query(`update "deletionRequest" set "status" = 'declined', "declineReason" = $2, "decidedAt" = now() where "id" = $1 and "status" = 'pending'`, [r.id, reason]);
      if (done.rowCount === 1) {
        decided += 1;
        await emailPerson(pool, r.userId, deletionDeclinedEmail(reason), deps);
      }
    } else if (r.status === "pending" && ops === "APPROVED") {
      const done = await pool.query(`update "deletionRequest" set "status" = 'approved', "decidedAt" = now() where "id" = $1 and "status" = 'pending'`, [r.id]);
      if (done.rowCount === 1) {
        decided += 1;
        // Every session ends now; the sign-in check keeps the person out until staff restore it.
        await pool.query(`delete from "session" where "userId" = $1`, [r.userId]);
        await emailPerson(pool, r.userId, deletionApprovedEmail(RETENTION_DAYS), deps);
      }
    } else if (r.status === "pending" && ops === "WITHDRAWN") {
      await pool.query(`update "deletionRequest" set "status" = 'cancelled', "cancelledAt" = now(), "withdrawNotifiedAt" = now() where "id" = $1 and "status" = 'pending'`, [r.id]);
    } else if (r.status === "approved" && ops === "RESTORED") {
      const done = await pool.query(`update "deletionRequest" set "status" = 'restored', "decidedAt" = now() where "id" = $1 and "status" = 'approved'`, [r.id]);
      if (done.rowCount === 1) {
        decided += 1;
        await emailPerson(pool, r.userId, deletionRestoredEmail(), deps);
      }
    }
  }
  return { sent, decided };
}
