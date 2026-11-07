import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSession } from "@/lib/session";
import { loadBillingHistory } from "@/modules/account/billing";

// GET /api/account/billing: the signed-in person's own business's invoices, payments and subscription state, read from Ops. Account host only. There is no
// parameter that names a business: it is the one the verified session belongs to.
export async function GET(request: Request) {
  const headers = { "cache-control": "no-store" };
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const result = await loadBillingHistory(await getSession());
  if (result.status === "unauthenticated") return Response.json({ status: "unauthenticated" }, { status: 401, headers });
  if (result.status === "unavailable") return Response.json({ status: "unavailable" }, { status: 502, headers });
  return Response.json(result, { headers });
}
