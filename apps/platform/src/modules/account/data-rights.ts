import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { listDevices } from "./devices";
import { getProfile } from "./profile";
import { listSignInHistory } from "./sign-in-history";

// The person's own data: a download of what the Platform's identity holds about them, and a request to delete the account. Both are scoped to the
// caller's own provider user id. The export holds NO password hash, token, session secret or other person's data.
export type DeletionStatus = { status: "none" } | { status: "pending"; requestedAt: string };
export type RequestResult = { ok: true } | { ok: false; reason: "has_business" | "already_pending" };

export async function getDeletionStatus(pool: Pool, userId: string): Promise<DeletionStatus> {
  const { rows } = await pool.query(`select "requestedAt" from "deletionRequest" where "userId" = $1 and "status" = 'pending'`, [userId]);
  return rows[0] ? { status: "pending", requestedAt: (rows[0].requestedAt as Date).toISOString() } : { status: "none" };
}

/** A person who still has an active business must hand it over or close it first, so the request is refused with a reason. */
export async function requestDeletion(pool: Pool, userId: string, input: { hasBusiness: boolean; reason?: unknown }): Promise<RequestResult> {
  if (input.hasBusiness) return { ok: false, reason: "has_business" };
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) || null : null;
  const done = await pool.query(`insert into "deletionRequest" ("id", "userId", "status", "reason") values ($1, $2, 'pending', $3) on conflict ("userId") where "status" = 'pending' do nothing`, [randomUUID(), userId, reason]);
  return done.rowCount === 1 ? { ok: true } : { ok: false, reason: "already_pending" };
}

export async function cancelDeletion(pool: Pool, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`update "deletionRequest" set "status" = 'cancelled', "cancelledAt" = now() where "userId" = $1 and "status" = 'pending'`, [userId]);
  return rowCount === 1;
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
