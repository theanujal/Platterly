import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionSecret, stubOrigin } from "@/lib/config";
import { pool } from "@/lib/db";
import { endSessionUrl } from "@/lib/oidc";
import { endSessionById, resolveSession } from "@/lib/session";
import { cookieFlags } from "@/lib/server";

// POST, same-origin only (a cross-site page cannot sign anyone out). Ends this product's session first, then sends the browser to the provider's
// end-session endpoint, which ends the provider session and calls every other product's back-channel logout address.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== stubOrigin()) return new NextResponse("Forbidden", { status: 403 });
  const cookie = (request.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  const session = await resolveSession(pool(), sessionSecret(), cookie);
  if (session) await endSessionById(pool(), session.id);
  const response = NextResponse.redirect(session ? endSessionUrl(session.idToken) : `${stubOrigin()}/`, 303);
  response.cookies.set(SESSION_COOKIE, "", cookieFlags(0));
  response.headers.set("cache-control", "no-store");
  return response;
}
