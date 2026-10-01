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
 * `/api/health` stays reachable on any host for uptime checks.
 *
 * Indexing (AJ, 2026-10-01): the only indexable page is a kitchen's own
 * storefront, `catering.platterly.in/{kitchen-slug}` — one non-reserved path
 * segment. Everything else (the whole customer journey: /quote/*,
 * /menu-approval/*, /{slug}/plan/*; every admin page; the whole ops host)
 * gets `X-Robots-Tag: noindex` here, in one place, instead of per page.
 */
const OPS_ALLOWED = ["/super", "/api/auth", "/api/health"];

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
    const allowed = OPS_ALLOWED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (!allowed) return withIndexing(new NextResponse("Not found", { status: 404 }), false);
    return withIndexing(NextResponse.next(), false);
  }
  if (kind === "catering" && isSuperPath) {
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
