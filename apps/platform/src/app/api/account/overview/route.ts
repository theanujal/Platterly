import { prisma } from "@/lib/db";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSession } from "@/lib/session";
import { loadAccountOverview, toResponse } from "@/modules/account/overview";

// GET /api/account/overview: the read-only data behind every Account screen. Account host only (404 elsewhere, like the pages). The caller is
// whoever `getSession()` says; there is no parameter that names a user or a business.
export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  return toResponse(await loadAccountOverview(prisma, await getSession()));
}
