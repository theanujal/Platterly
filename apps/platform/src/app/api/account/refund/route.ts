import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSession } from "@/lib/session";
import { accountOrigin } from "@/modules/auth/config";
import { requestRefund } from "@/modules/store/purchase";

// POST /api/account/refund: the Admin asks for a refund on one paid payment of their own business. Account host only, same-origin JSON only. There is no parameter that
// names a business: it is the one the verified session is the active Admin of. Platterly staff decide in Ops; Ops's message is passed on only for a 400 (written for people).
export async function POST(request: Request) {
  const headers = { "cache-control": "no-store" };
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers });
  const body = await request.json().catch(() => null);
  const result = await requestRefund(await getSession(), body && typeof body === "object" ? body : {});
  if (result.ok) return Response.json(result.answer, { headers });
  const status = result.reason === "not_signed_in" ? 401 : result.reason === "no_business" ? 409 : result.reason === "not_admin" ? 403 : result.reason === "bad_request" || result.reason === "rejected" ? 400 : result.reason === "unknown_business" ? 404 : 502;
  return Response.json({ error: result.reason, ...(result.reason === "rejected" && result.message ? { message: result.message } : {}) }, { status, headers });
}
