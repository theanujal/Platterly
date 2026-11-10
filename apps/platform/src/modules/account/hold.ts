import { newId, parseAccountReviewRequest, PLATFORM_ACCOUNT_REVIEW_PATH, PLATFORM_ACCOUNT_REVIEW_STATUS_PATH, requestTarget, signedHeaders, type AccountReviewReason } from "@platterly/contract";
import { verifyPullResponse } from "@platterly/platform-contract";
import type { Pool } from "pg";

// Account on hold (AJ, 2026-11-10). When the OLD address cancels an email change, the account is held: nobody can sign in until Ops staff have verified the
// person. Ops is told once (a signed POST with the platform-billing secret); and when the held person tries to sign in, the Platform asks Ops whether the review is
// cleared (same secret), so Ops never has to call the Platform. If Ops cannot be reached the hold stays: it fails closed. A lifted hold is kept as history.
export type HoldRow = { userId: string; reviewId: string; reason: string; opsNotifiedAt: Date | null };
type Deps = { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now?: number };

export const opsReviewConfigured = (env: NodeJS.ProcessEnv = process.env) => Boolean(env.OPS_BASE_URL && env.OPS_PLATFORM_BILLING_SECRET && env.OPS_PLATFORM_BILLING_SECRET.length >= 32);

/** The person's open hold, or null. */
export async function openHold(pool: Pick<Pool, "query">, userId: string): Promise<HoldRow | null> {
  const { rows } = await pool.query('select "userId", "reviewId", "reason", "opsNotifiedAt" from "accountHold" where "userId" = $1 and "liftedAt" is null', [userId]);
  return (rows[0] as HoldRow | undefined) ?? null;
}

export async function opsPost(path: string, body: unknown, deps: Deps): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; reason: "not_configured" | "unreachable" | "refused" | "bad_answer" | "unknown" }> {
  const env = deps.env ?? process.env;
  const secret = env.OPS_PLATFORM_BILLING_SECRET;
  if (!opsReviewConfigured(env) || !secret) return { ok: false, reason: "not_configured" };
  const url = new URL(path, env.OPS_BASE_URL);
  const requestId = newId("command");
  const text = JSON.stringify(body);
  let response: Response;
  let raw: string;
  try {
    response = await (deps.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...signedHeaders(secret, requestId, text, { now: deps.now === undefined ? undefined : Math.floor(deps.now / 1000), target: requestTarget("POST", url.toString()) }) },
      body: text,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    raw = await response.text();
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (response.status === 401) return { ok: false, reason: "refused" };
  const verified = verifyPullResponse([secret], requestId, response.headers, raw, deps.now);
  if (!verified.ok) return { ok: false, reason: "bad_answer" };
  if (response.status === 404) return { ok: false, reason: "unknown" };
  if (!response.ok) return { ok: false, reason: "refused" };
  return { ok: true, value: verified.value };
}

/** Tells Ops about the review (once; Ops treats a repeat as nothing new) and remembers that it was told. Returns whether Ops now knows. */
export async function notifyOps(pool: Pool, review: { userId: string; reviewId: string; oldEmail: string; newEmail: string; reason: AccountReviewReason; note: string; requestedAt: Date }, deps: Deps = {}): Promise<boolean> {
  const payload = { reviewId: review.reviewId, subject: review.userId, oldEmail: review.oldEmail, newEmail: review.newEmail, reason: review.reason, note: review.note, requestedAt: review.requestedAt.toISOString() };
  if (!parseAccountReviewRequest(payload).ok) return false;
  const got = await opsPost(PLATFORM_ACCOUNT_REVIEW_PATH, payload, deps);
  if (!got.ok) return false;
  await pool.query('update "accountHold" set "opsNotifiedAt" = now() where "userId" = $1 and "opsNotifiedAt" is null', [review.userId]);
  return true;
}

/** Holds Ops has not been told about yet (Ops was down at the time): told again by the scheduled job, or at the person's next sign-in attempt. */
export async function resendUnnotified(pool: Pool, deps: Deps = {}): Promise<number> {
  const { rows } = await pool.query(
    `select h."userId", h."reviewId", h."createdAt", c."oldEmail", c."newEmail", c."cancelReason", c."cancelNote"
     from "accountHold" h join "emailChange" c on c."id" = h."reviewId" where h."liftedAt" is null and h."opsNotifiedAt" is null`,
  );
  let sent = 0;
  for (const r of rows) {
    const ok = await notifyOps(pool, { userId: r.userId, reviewId: r.reviewId, oldEmail: r.oldEmail, newEmail: r.newEmail, reason: (r.cancelReason ?? "other") as AccountReviewReason, note: r.cancelNote ?? "", requestedAt: r.createdAt }, deps);
    if (ok) sent += 1;
  }
  return sent;
}

/**
 * Whether this person may sign in. A person with no hold may. A held person may only once Ops says staff cleared the review; then the hold is lifted for good.
 * Any trouble reaching Ops, or a wrong answer, keeps the hold (it fails closed).
 */
export async function mayStartSession(pool: Pool, userId: string, deps: Deps = {}): Promise<boolean> {
  const hold = await openHold(pool, userId);
  if (!hold) return true;
  const got = await opsPost(PLATFORM_ACCOUNT_REVIEW_STATUS_PATH, { reviewId: hold.reviewId }, deps);
  if (!got.ok) {
    // Ops has never heard of it (it was down when the review was cancelled): tell it now, so staff can see it. The person stays held.
    if (got.reason === "unknown") await resendUnnotified(pool, deps).catch(() => undefined);
    return false;
  }
  if (got.value.status !== "CLEARED") return false;
  await pool.query('update "accountHold" set "liftedAt" = now() where "userId" = $1 and "liftedAt" is null', [userId]);
  return true;
}
