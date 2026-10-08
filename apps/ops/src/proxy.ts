import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optimistic gate only: a request with no session cookie goes to the sign-in page. Real authorisation happens in each
 * page and action (`requireStaff`). The API routes answer for themselves: auth, health, and the signed product events.
 */
const PUBLIC_PREFIXES = ["/sign-in", "/api/auth", "/api/health", "/api/products", "/api/webhooks", "/api/cron", "/api/site"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const hasSession = request.cookies.getAll().some((c) => c.name.endsWith("session_token"));
  if (!hasSession) return NextResponse.redirect(new URL("/sign-in", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)$).*)"] };
