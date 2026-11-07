import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PLATFORM_BILLING_PATH_PATTERN, PLATFORM_CHECKOUT_PATH_PATTERN, PLATFORM_INVOICE_PATH_PATTERN } from "@platterly/contract";

/**
 * Optimistic gate only: a request with no session cookie goes to the sign-in page. Real authorisation happens in each
 * page and action (`requireStaff`). The API routes answer for themselves: auth, health, and the signed product events.
 */
const PUBLIC_PREFIXES = ["/sign-in", "/api/auth", "/api/health", "/api/products", "/api/webhooks", "/api/cron", "/api/site", "/api/public"];
/** Exactly these routes and no others under /api/platform: the signed product list, plan catalogue and one-business billing read and the Store checkout and verify calls for the Platform (it checks its own HMAC signature). */
const PUBLIC_EXACT = ["/api/platform/products", "/api/platform/plans"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_EXACT.includes(pathname) || PLATFORM_BILLING_PATH_PATTERN.test(pathname) || PLATFORM_CHECKOUT_PATH_PATTERN.test(pathname) || PLATFORM_INVOICE_PATH_PATTERN.test(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const hasSession = request.cookies.getAll().some((c) => c.name.endsWith("session_token"));
  if (!hasSession) return NextResponse.redirect(new URL("/sign-in", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)$).*)"] };
