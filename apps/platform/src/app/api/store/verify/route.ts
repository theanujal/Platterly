import { hostKind, requestHost, originFor } from "@/lib/routing/hosts";
import { getSession } from "@/lib/session";
import { finishPurchase } from "@/modules/store/purchase";

// POST /api/store/verify: confirms what Razorpay Checkout returned. Same guards as /api/store/checkout; Ops checks Razorpay's signature.
export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "store") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== originFor("store")) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const result = await finishPurchase(await getSession(), body && typeof body === "object" ? body : {});
  const headers = { "cache-control": "no-store" };
  if (result.ok) return Response.json(result.answer, { headers });
  const status = result.reason === "not_signed_in" ? 401 : result.reason === "no_business" ? 409 : result.reason === "bad_request" || result.reason === "rejected" ? 400 : result.reason === "unknown_business" ? 404 : 502;
  return Response.json({ error: result.reason, ...(result.reason === "rejected" && result.message ? { message: result.message } : {}) }, { status, headers });
}
