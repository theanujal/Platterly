import { NextResponse } from "next/server";
import { auditAuthEvent } from "@/modules/auth/audit";
import { readAccountCookie } from "@/modules/auth/account-session";
import { SURFACES } from "@/modules/auth/config";
import { cookieOptions } from "@/modules/auth/cookies";
import { surfaceOf } from "@/modules/auth/host";
import { identityPool } from "@/modules/auth/identity-db";
import { idp } from "@/modules/auth/idp";
import { providerSessionEnder } from "@/modules/auth/provider-sessions";
import { endSession } from "@/modules/auth/session-store";

// Account and Store hosts: sign out. POST only and same-origin only (a cross-site page cannot sign anyone out). It ends the identity-provider session itself, so
// every client of that session ends with it (RP-initiated logout), then clears the Account cookie.
export async function POST(request: Request) {
  const surface = surfaceOf(request);
  if (!surface) return new NextResponse("Not found", { status: 404 });
  const { origin: originOf, sessionCookie } = SURFACES[surface];
  const origin = request.headers.get("origin");
  if (origin !== originOf()) return new NextResponse("Forbidden", { status: 403 });
  const secret = process.env.AUTH_SECRET;
  const raw = (request.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
  const cookie = secret ? readAccountCookie(raw, secret) : null;
  if (cookie) {
    await endSession(identityPool(), cookie.sid, cookie.sub, await providerSessionEnder(idp())).catch(() => false);
    await auditAuthEvent({ action: "auth.sign_out", outcome: "done", userId: cookie.uid });
  }
  const response = NextResponse.redirect(`${originOf()}/`, 303);
  response.cookies.set(sessionCookie, "", { ...cookieOptions(0), maxAge: 0 });
  response.headers.set("cache-control", "no-store");
  return response;
}
