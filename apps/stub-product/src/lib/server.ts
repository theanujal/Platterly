import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionSecret } from "./config";
import { pool } from "./db";
import { resolveSession, type StubSession } from "./session";

/** The signed-in person for this request, looked up in the database every time (so a logout is felt on the next request), or null. */
export async function currentSession(): Promise<StubSession | null> {
  return resolveSession(pool(), sessionSecret(), (await cookies()).get(SESSION_COOKIE)?.value);
}

export const cookieFlags = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, path: "/", maxAge, secure: process.env.NODE_ENV === "production" });
