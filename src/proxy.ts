import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { isReservedPathSegment } from "@/lib/routing/reserved-words";

/**
 * Splits the one app into per-host surfaces (see `lib/routing/hosts.ts`).
 * Session cookies stay host-only, so a caterer session on catering.* can
 * never reach ops.* and the reverse. Auth itself is still enforced per page
 * (`require-session.ts`); this only decides which routes a host may serve.
 * A bare or unknown host (plain `localhost`, the apex, an IP) serves no page of
 * this app and is never redirected: that host is reserved for the landing page,
 * which is hosted separately. A browser visit there gets a 404 for now.
 * `/api/health` stays reachable on any host for uptime checks. Every other `/api/*` route (sign-in, the
 * Razorpay webhook) answers only on its own product host; on a bare or unknown host it is a 404 for every
 * kind of request, not just a browser page load.
 *
 * Entry point (AJ, 2026-10-03): opening `catering.platterly.in/` shows the kitchen sign-in / sign-up page
 * straight away. The URL stays `/` (a rewrite). The old address `/kitchenlogin` redirects there (a temporary,
 * 307 redirect, so a bookmark never gets stuck if the root ever changes); the wizard under it stays put.
 *
 * Indexing (AJ, 2026-10-01): the only indexable page is a kitchen's own
 * storefront, `catering.platterly.in/{kitchen-slug}` — one non-reserved path
 * segment. Everything else (the whole customer journey: /quote/*,
 * /menu-approval/*, /{slug}/plan/*; every admin page; the whole ops host)
 * gets `X-Robots-Tag: noindex` here, in one place, instead of per page.
 */
const OPS_ALLOWED = ["/super", "/api/auth", "/api/health", "/sw.js"];
// The brand marks the Super Admin sidebar and sign-in page draw (public/platterly-mark.svg, platterly-logo.*).
const OPS_BRAND_ASSET = /^\/platterly-[a-z-]+\.(svg|png)$/;

function isStorefrontPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length === 1 && !isReservedPathSegment(segments[0]);
}

function withIndexing(response: NextResponse, indexable: boolean): NextResponse {
  if (!indexable) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export function proxy(request: NextRequest) {
  const kind = hostKind(requestHost(request.headers));
  const { pathname } = request.nextUrl;
  const isSuperPath = pathname === "/super" || pathname.startsWith("/super/");

  if (kind === "ops") {
    if (pathname === "/") return withIndexing(NextResponse.rewrite(new URL("/super", request.url)), false);
    const allowed = OPS_ALLOWED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) || OPS_BRAND_ASSET.test(pathname);
    if (!allowed) return withIndexing(new NextResponse("Not found", { status: 404 }), false);
    return withIndexing(NextResponse.next(), false);
  }
  if (kind === "catering" && isSuperPath) {
    return withIndexing(new NextResponse("Not found", { status: 404 }), false);
  }
  if (kind === "catering" && (pathname === "/kitchenlogin" || pathname === "/kitchenlogin/")) {
    // Built from the host the visitor typed, not request.url: behind Nginx the app may see an internal host.
    const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    const target = new URL(`/${request.nextUrl.search}`, `${proto}://${requestHost(request.headers)}`);
    return withIndexing(NextResponse.redirect(target, 307), false);
  }
  if (kind === "catering" && pathname === "/") {
    return withIndexing(NextResponse.rewrite(new URL("/kitchenlogin", request.url)), false);
  }
  // An API route is never served on a bare or unknown host (only the uptime check is).
  if (kind === "other" && (pathname === "/api" || pathname.startsWith("/api/")) && pathname !== "/api/health") {
    return withIndexing(new NextResponse("Not found", { status: 404 }), false);
  }
  // Only a real browser page load is refused. Next's own internal requests (e.g. the
  // fetch it makes to follow a Server Action's redirect()) reach this app on the bare
  // host without the browser's cookies, and refusing those breaks the action.
  const isBrowserNavigation = request.headers.get("sec-fetch-dest") === "document";
  if (kind === "other" && isBrowserNavigation && pathname !== "/api/health") {
    return withIndexing(new NextResponse("Not found", { status: 404 }), false);
  }
  return withIndexing(NextResponse.next(), isStorefrontPath(pathname));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
