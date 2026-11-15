import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { loadAccountProductCards } from "@/modules/account/product-cards";

// GET /api/account/products: the cards on My Products and the Overview, read from Ops. Account host only, and only for a signed-in person (no parameter names anyone).
export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const headers = { "cache-control": "no-store" };
  if (!(await getSessionRef())) return Response.json({ status: "unauthenticated" }, { status: 401, headers });
  return Response.json(await loadAccountProductCards(), { headers });
}
