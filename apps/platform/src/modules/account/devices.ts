import type { Pool } from "pg";
import { endAllSessions, endSession, listLiveSessions } from "../auth/session-store";

// F4.3.1 session list, revoke and sign out everywhere. User-level only and own-session only: every query is scoped to the caller's own provider user
// id (taken from the verified session, never from the request), so nobody can see or end anybody else's session.
export type DeviceView = { id: string; label: string; lastActive: string; current: boolean };

/** A plain label from the browser's user-agent string. Nothing else about the device (no IP address) is shown. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const device = /iPhone/.test(ua) ? "an iPhone" : /iPad/.test(ua) ? "an iPad" : /Android/.test(ua) ? "an Android device" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "a Mac" : /Linux|X11/.test(ua) ? "Linux" : "";
  return device ? `${browser} on ${device}` : browser;
}

export async function listDevices(pool: Pool, providerUserId: string, currentSid: string, now: Date = new Date()): Promise<DeviceView[]> {
  const rows = await listLiveSessions(pool, providerUserId, now);
  return rows.map((r) => ({ id: r.id, label: deviceLabel(r.userAgent), lastActive: r.updatedAt.toISOString(), current: r.id === currentSid }));
}

export type RevokeResult = { ok: true; ended: number; signedOut: boolean } | { ok: false; reason: "not_found" };

/** Ends one of the caller's own sessions. Another person's session id (or an unknown one) is "not found": the answer never reveals which. */
export async function revokeDevice(pool: Pool, providerUserId: string, currentSid: string, targetSid: string): Promise<RevokeResult> {
  if (!(await endSession(pool, targetSid, providerUserId))) return { ok: false, reason: "not_found" };
  return { ok: true, ended: 1, signedOut: targetSid === currentSid };
}

export async function revokeAllDevices(pool: Pool, providerUserId: string): Promise<RevokeResult> {
  return { ok: true, ended: await endAllSessions(pool, providerUserId), signedOut: true };
}
