import { NextResponse } from "next/server";
import { auditAuthEvent } from "@/modules/auth/audit";
import { sealAccountSession } from "@/modules/auth/account-session";
import { ACCOUNT_COOKIE_MAX_AGE } from "@/modules/auth/cookies";
import { COOKIES, accountOrigin } from "@/modules/auth/config";
import { cookieOptions } from "@/modules/auth/cookies";
import { isHost } from "@/modules/auth/host";
import { idp } from "@/modules/auth/idp";
import { completeSignIn } from "@/modules/auth/oidc-client";

// Account host: the end of the code flow. Validates everything (see oidc-client.ts), links the person to a Platform user, and only then sets the
// Account's own session cookie. Any failure clears the transaction cookie and shows a generic page; the reason goes to the audit log, not the browser.
export async function GET(request: Request) {
  if (!isHost(request, "account")) return new NextResponse("Not found", { status: 404 });
  const secret = process.env.AUTH_SECRET;
  if (!secret) return new NextResponse("Sign-in is not configured", { status: 503 });
  const cookieHeader = request.headers.get("cookie") ?? "";
  const tx = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${COOKIES.oidcTransaction}=`))?.slice(COOKIES.oidcTransaction.length + 1);

  const result = await completeSignIn({ secret, transactionCookie: tx, params: new URL(request.url).searchParams, handler: (r) => idp().handler(r) });
  if (!result.ok) {
    await auditAuthEvent({ action: "auth.sign_in", outcome: "refused", reasonCode: result.reason });
    const response = NextResponse.redirect(`${accountOrigin()}/auth/error`, 303);
    response.cookies.set(COOKIES.oidcTransaction, "", { ...cookieOptions(0, "/auth"), maxAge: 0 });
    return response;
  }
  await auditAuthEvent({ action: "auth.sign_in", outcome: "done", userId: result.userId });
  const response = NextResponse.redirect(`${accountOrigin()}${result.next}`, 303);
  response.cookies.set(COOKIES.accountSession, sealAccountSession(secret, { sid: result.sid, sub: result.sub, uid: result.userId }), cookieOptions(ACCOUNT_COOKIE_MAX_AGE));
  response.cookies.set(COOKIES.oidcTransaction, "", { ...cookieOptions(0, "/auth"), maxAge: 0 });
  response.headers.set("cache-control", "no-store");
  return response;
}
