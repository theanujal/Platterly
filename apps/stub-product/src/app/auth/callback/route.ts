import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_SECONDS, TX_COOKIE, sessionSecret, stubOrigin } from "@/lib/config";
import { pool } from "@/lib/db";
import { completeSignIn } from "@/lib/oidc";
import { cookieFlags } from "@/lib/server";

export async function GET(request: Request) {
  const jar = Object.fromEntries((request.headers.get("cookie") ?? "").split(/;\s*/).filter(Boolean).map((c) => [c.slice(0, c.indexOf("=")), c.slice(c.indexOf("=") + 1)]));
  const result = await completeSignIn({ pool: pool(), secret: sessionSecret(), transactionCookie: jar[TX_COOKIE], params: new URL(request.url).searchParams });
  if (!result.ok) {
    const response = new NextResponse(`<!doctype html><title>Sign-in failed</title><main><h1>We could not sign you in</h1><p data-reason="${result.reason}">Try again.</p><p><a href="/login">Sign in</a></p></main>`, { status: 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    response.cookies.set(TX_COOKIE, "", cookieFlags(0));
    return response;
  }
  const response = NextResponse.redirect(`${stubOrigin()}${result.next}`, 303);
  response.cookies.set(SESSION_COOKIE, result.sessionCookie, cookieFlags(SESSION_SECONDS));
  response.cookies.set(TX_COOKIE, "", cookieFlags(0));
  response.headers.set("cache-control", "no-store");
  return response;
}
