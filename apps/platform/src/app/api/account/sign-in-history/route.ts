import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { identityPool } from "@/modules/auth/identity-db";
import { listSignInHistory } from "@/modules/account/sign-in-history";

// GET /api/account/sign-in-history: the signed-in person's own sign-ins and refused attempts of the last 90 days. Account host only.
export async function GET(request: Request) {
  const headers = { "cache-control": "no-store" };
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers });
  try {
    return Response.json({ status: "ok", days: 90, entries: await listSignInHistory(identityPool(), ref.sub) }, { headers });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers });
  }
}
