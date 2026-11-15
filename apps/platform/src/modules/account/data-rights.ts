import type { AccountDeletionRequest } from "@platterly/contract";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { listDevices } from "./devices";
import { getProfile } from "./profile";
import { listSignInHistory } from "./sign-in-history";

// The person's own data: a download of what the Platform's identity holds about them, and a request to delete the account. Both are scoped to the
// caller's own provider user id. The export holds NO password hash, token, session secret or other person's data.
export type DeletionStatus = { status: "none" } | { status: "pending"; requestedAt: string } | { status: "declined"; requestedAt: string; declineReason: string };

export async function getDeletionStatus(pool: Pool, userId: string): Promise<DeletionStatus> {
  const { rows } = await pool.query(`select "requestedAt", "status", "declineReason" from "deletionRequest" where "userId" = $1 and "status" in ('pending', 'declined') order by "requestedAt" desc limit 1`, [userId]);
  const r = rows[0];
  if (!r) return { status: "none" };
  const requestedAt = (r.requestedAt as Date).toISOString();
  return r.status === "pending" ? { status: "pending", requestedAt } : { status: "declined", requestedAt, declineReason: r.declineReason ?? "" };
}

/**
 * Records the person's request. It covers their business too when they are its Admin (one request, made on My Profile). `details` is what Ops shows staff; it is
 * kept with the request so it can be sent again if Ops was down.
 */
export type DeletionDetails = Omit<AccountDeletionRequest, "requestId" | "reason" | "requestedAt">;
export async function requestDeletion(pool: Pool, userId: string, input: { details: DeletionDetails; reason?: unknown }): Promise<{ ok: true; payload: AccountDeletionRequest } | { ok: false; reason: "already_pending" }> {
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : "";
  const requestId = randomUUID();
  const payload: AccountDeletionRequest = { requestId, ...input.details, reason, requestedAt: new Date().toISOString() };
  const done = await pool.query(`insert into "deletionRequest" ("id", "userId", "status", "reason", "opsPayload") values ($1, $2, 'pending', $3, $4) on conflict ("userId") where "status" = 'pending' do nothing`, [requestId, userId, reason || null, JSON.stringify(payload)]);
  return done.rowCount === 1 ? { ok: true, payload } : { ok: false, reason: "already_pending" };
}

/** Withdraws the person's pending request and returns its id (so Ops can be told), or null when there was none. */
export async function cancelDeletion(pool: Pool, userId: string): Promise<string | null> {
  const { rows } = await pool.query(`update "deletionRequest" set "status" = 'cancelled', "cancelledAt" = now() where "userId" = $1 and "status" = 'pending' returning "id"`, [userId]);
  return (rows[0]?.id as string | undefined) ?? null;
}

export type ExportBusiness = { name: string; role: string; status: string } | null;

export async function buildExport(pool: Pool, userId: string, currentSid: string, business: ExportBusiness, now: Date = new Date()) {
  const profile = await getProfile(pool, userId);
  if (!profile) return null;
  const { photoVersion, ...details } = profile;
  return {
    exportedAt: now.toISOString(),
    scope: "What Platterly's central identity holds about you. Data kept inside a product, such as Caterly's orders and customers, is not included here.",
    profile: { ...details, hasPhoto: photoVersion !== null },
    business,
    signedInDevices: (await listDevices(pool, userId, currentSid, now)).map(({ id: _id, ...d }) => d),
    signInHistory: (await listSignInHistory(pool, userId, now)).map(({ id: _id, ...e }) => e),
    deletionRequest: await getDeletionStatus(pool, userId),
  };
}
