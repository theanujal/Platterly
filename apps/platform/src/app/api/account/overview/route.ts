import { prisma } from "@/lib/db";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { loadAccountOverview, toResponse } from "@/modules/account/overview";
import { getProfile } from "@/modules/account/profile";
import { identityPool } from "@/modules/auth/identity-db";

// GET /api/account/overview: the data behind every Account screen. Account host only (404 elsewhere, like the pages). The caller is whoever the
// verified session says; there is no parameter that names a user or a business. The person's name comes from their own identity profile; if that
// cannot be read the screens simply show the email.
export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const ref = await getSessionRef();
  const result = await loadAccountOverview(prisma, ref?.session ?? null);
  if (ref && result.status === "ok") {
    try {
      const name = (await getProfile(identityPool(), ref.sub))?.name;
      if (name) result.overview.user.name = name;
    } catch {
      /* the email is shown instead */
    }
  }
  return toResponse(result);
}
