import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PLATFORM_ACCOUNT_REVIEW_PATH, PLATFORM_ACCOUNT_REVIEW_STATUS_PATH, PLATFORM_ACCOUNT_DELETION_PATH, PLATFORM_ACCOUNT_DELETION_STATUS_PATH, PLATFORM_ACCOUNT_DELETION_WITHDRAW_PATH, PLATFORM_ACCOUNT_DELETION_ERASED_PATH, PLATFORM_PRODUCT_CARDS_PATH, PLATFORM_PRODUCT_CARD_IMAGE_PATH_PATTERN, PLATFORM_BILLING_PATH_PATTERN, PLATFORM_PRODUCT_BILLING_PROFILES_PATH_PATTERN, PLATFORM_CHECKOUT_PATH_PATTERN, PLATFORM_INVOICE_PATH_PATTERN, PLATFORM_CREDIT_NOTE_PATH_PATTERN } from "@platterly/contract";

/**
 * Optimistic gate only: a request with no session cookie goes to the sign-in page. Real authorisation happens in each
 * page and action (`requireStaff`). The API routes answer for themselves: auth, health, and the signed product events.
 */
const PUBLIC_PREFIXES = ["/sign-in", "/api/auth", "/api/health", "/api/products", "/api/webhooks", "/api/cron", "/api/site", "/api/public"];
/** Exactly these routes and no others under /api/platform: the signed product list, plan catalogue and one-business billing read, the one-business billing details read and save, and the Store checkout and verify calls for the Platform (it checks its own HMAC signature). */
const PUBLIC_EXACT = ["/api/platform/products", "/api/platform/plans", PLATFORM_PRODUCT_CARDS_PATH, PLATFORM_ACCOUNT_REVIEW_PATH, PLATFORM_ACCOUNT_REVIEW_STATUS_PATH, PLATFORM_ACCOUNT_DELETION_PATH, PLATFORM_ACCOUNT_DELETION_STATUS_PATH, PLATFORM_ACCOUNT_DELETION_WITHDRAW_PATH, PLATFORM_ACCOUNT_DELETION_ERASED_PATH];

/** The one host that serves Ops pages: the host of BETTER_AUTH_URL (`ops.localhost` in dev, `ops.platterly.in` in production). Unset means no host rule (unit tests). */
function opsHostname(): string | null {
  try { return process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL).hostname.toLowerCase() : null; } catch { return null; }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // A browser page load on any other host (plain `localhost`, an IP, a look-alike) gets a 404, as the catering app does on a bare host. API calls
  // from the products are not page loads and stay reachable by whatever address the server has; they are signed and checked in their routes.
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const expected = opsHostname();
  if (expected && request.headers.get("sec-fetch-dest") === "document" && host !== expected) return new NextResponse("Not found", { status: 404 });
  if (PUBLIC_EXACT.includes(pathname) || PLATFORM_PRODUCT_CARD_IMAGE_PATH_PATTERN.test(pathname) || PLATFORM_BILLING_PATH_PATTERN.test(pathname) || PLATFORM_PRODUCT_BILLING_PROFILES_PATH_PATTERN.test(pathname) || PLATFORM_CHECKOUT_PATH_PATTERN.test(pathname) || PLATFORM_INVOICE_PATH_PATTERN.test(pathname) || PLATFORM_CREDIT_NOTE_PATH_PATTERN.test(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const hasSession = request.cookies.getAll().some((c) => c.name.endsWith("session_token"));
  if (!hasSession) return NextResponse.redirect(new URL("/sign-in", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)$).*)"] };
