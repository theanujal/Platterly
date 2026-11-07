import "server-only";
import { cookies, headers } from "next/headers";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { COOKIES } from "@/modules/auth/config";
import { resolveAccountSession } from "@/modules/auth/account-session";
import { identityPool } from "@/modules/auth/identity-db";

// The authenticated-session interface: the ONLY place the Account learns who is asking. It returns the person's Platform user id and when they last
// authenticated, or null when nobody is signed in.
//
// A session exists only if the request carries the Account's signed, host-only session cookie AND the identity-provider session it points at is
// still alive (idle and absolute expiry checked on every request, no cache). There is no environment variable, header, query string, fixture or
// default user that can stand in for that. Anything missing, forged, expired, revoked or unreachable returns null: it fails closed.
// Automated tests never call this for identity; they pass a `Session` value straight to the data layer (see modules/account/__tests__).
export type Session = { userId: string; authenticatedAt: Date };

/** The session plus the provider session it points at. Only the session-management routes need the extra fields (`sid`, `sub`). */
export type SessionRef = { session: Session; sid: string; sub: string };

export async function getSessionRef(): Promise<SessionRef | null> {
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret || !process.env.IDENTITY_DATABASE_URL) return null;
    const store = hostKind(requestHost(await headers())) === "store";
    const value = (await cookies()).get(store ? COOKIES.storeSession : COOKIES.accountSession)?.value;
    if (!value) return null;
    return await resolveAccountSession(identityPool(), secret, value);
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  return (await getSessionRef())?.session ?? null;
}
