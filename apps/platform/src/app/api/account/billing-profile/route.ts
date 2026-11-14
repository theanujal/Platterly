import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSession } from "@/lib/session";
import { accountOrigin } from "@/modules/auth/config";
import { loadMyBillingProfile, profileStatus, saveMyBillingProfile, type ProfileResult } from "@/modules/store/billing-profile";

// GET /api/account/billing-profile: the signed-in Admin's own business's saved billing details. PUT: save them. Account host only; PUT takes same-origin JSON only.
// There is no parameter that names a business or a person: it is the business the verified session is the active Admin of. Anyone else is refused (403 for a
// member who is not the Admin, such as the Old Admin).
const NO_STORE = { "cache-control": "no-store" };

function answer(result: ProfileResult) {
  if (result.ok) return Response.json({ status: "ok", ...result.answer }, { headers: NO_STORE });
  // Only a 400 from Ops carries its own message (written for people); the rest are plain codes.
  return Response.json({ status: result.reason, ...(result.fields ? { fields: result.fields } : {}), ...(result.reason === "rejected" && result.message ? { message: result.message } : {}) }, { status: profileStatus(result.reason), headers: NO_STORE });
}

export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  return answer(await loadMyBillingProfile(await getSession()));
}

export async function PUT(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  return answer(await saveMyBillingProfile(await getSession(), body));
}
