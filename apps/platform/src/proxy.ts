import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hostKind, requestHost } from "@/lib/routing/hosts";

/**
 * One app, three hosts (see `lib/routing/hosts.ts`). A bare or unknown host (plain `localhost`, an IP, a look-alike) serves
 * nothing and is never redirected: it answers 404 for every path except the uptime check `/api/health`.
 */
export function proxy(request: NextRequest) {
  const kind = hostKind(requestHost(request.headers));
  if (kind === "other" && request.nextUrl.pathname !== "/api/health") return new NextResponse("Not found", { status: 404 });
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
