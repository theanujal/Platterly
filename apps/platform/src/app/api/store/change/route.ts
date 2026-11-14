import { hostKind, requestHost, originFor } from "@/lib/routing/hosts";
import { getSession } from "@/lib/session";
import { changePlan } from "@/modules/store/purchase";

// POST /api/store/change: schedules a downgrade, undoes it, cancels (stops renewal) or reactivates. Store host only, same-origin only, and the business is the signed-in person's own (never named by the request).
export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "store") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== originFor("store")) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const result = await changePlan(await getSession(), body && typeof body === "object" ? body : {});
  const headers = { "cache-control": "no-store" };
  if (result.ok) return Response.json(result.answer, { headers });
  const status = result.reason === "not_signed_in" ? 401 : result.reason === "no_business" ? 409 : result.reason === "not_admin" ? 403 : result.reason === "bad_request" || result.reason === "rejected" ? 400 : result.reason === "unknown_business" ? 404 : 502;
  // Only a 400 from Ops carries its own message (written for people); everything else is a plain code.
  return Response.json({ error: result.reason, ...(result.reason === "rejected" && result.message ? { message: result.message } : {}) }, { status, headers });
}
