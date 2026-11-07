import { hostKind, requestHost, originFor } from "@/lib/routing/hosts";
import { getSession } from "@/lib/session";
import { startPurchase } from "@/modules/store/purchase";

// POST /api/store/checkout: starts the signed-in person's one-time payment for their own business. Store host only, same-origin only (a page on another
// site cannot start a payment), and the business is never read from the request: it is the one the verified session belongs to.
export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "store") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== originFor("store")) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const result = await startPurchase(await getSession(), body && typeof body === "object" ? body : {});
  return reply(result);
}

function reply(result: Awaited<ReturnType<typeof startPurchase>>) {
  const headers = { "cache-control": "no-store" };
  if (result.ok) return Response.json(result.answer, { headers });
  const status = result.reason === "not_signed_in" ? 401 : result.reason === "no_business" ? 409 : result.reason === "bad_request" || result.reason === "rejected" ? 400 : result.reason === "unknown_business" ? 404 : 502;
  // Only a 400 from Ops carries its own message (written for people); everything else is a plain code.
  return Response.json({ error: result.reason, ...(result.reason === "rejected" && result.message ? { message: result.message } : {}), ...(result.fields ? { fields: result.fields } : {}) }, { status, headers });
}
