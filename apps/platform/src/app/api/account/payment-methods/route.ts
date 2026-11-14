import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSession } from "@/lib/session";
import { accountOrigin } from "@/modules/auth/config";
import { loadMyPaymentMethods } from "@/modules/account/payment-methods";
import { managePaymentMethod } from "@/modules/store/purchase";

// GET /api/account/payment-methods: the signed-in Admin's own business's saved payment methods and auto-pay, per product. POST: list, add a card, make one primary
// or remove one (and, from 3b.3b, pause, resume or stop auto-pay). Account host only; POST takes same-origin JSON only. There is no parameter that names a business
// or a person: it is the business the verified session is the active Admin of. Anyone else is refused (403 for a member who is not the Admin, such as the Old Admin).
const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const result = await loadMyPaymentMethods(await getSession());
  if (result.ok) return Response.json({ status: "ok", businessName: result.businessName, products: result.products }, { headers: NO_STORE });
  const status = result.reason === "not_signed_in" ? 401 : result.reason === "not_admin" ? 403 : result.reason === "no_business" ? 409 : 502;
  return Response.json({ status: result.reason }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const body = await request.json().catch(() => null);
  const result = await managePaymentMethod(await getSession(), body);
  if (result.ok) return Response.json(result.answer, { headers: NO_STORE });
  const status = result.reason === "not_signed_in" ? 401 : result.reason === "no_business" ? 409 : result.reason === "not_admin" ? 403 : result.reason === "bad_request" || result.reason === "rejected" ? 400 : result.reason === "unknown_business" ? 404 : 502;
  // Only a 400 from Ops carries its own message (written for people); everything else is a plain code.
  return Response.json({ error: result.reason, ...(result.reason === "rejected" && result.message ? { message: result.message } : {}) }, { status, headers: NO_STORE });
}
