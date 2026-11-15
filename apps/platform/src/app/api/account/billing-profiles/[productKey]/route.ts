import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSession } from "@/lib/session";
import { accountOrigin } from "@/modules/auth/config";
import { profileStatus } from "@/modules/store/billing-profile";
import { saveMyProductBillingProfile } from "@/modules/store/product-billing-profiles";

// PUT /api/account/billing-profiles/{productKey}: save one product's profile, or copy another's into it ({ baseVersion, fields } or { baseVersion, copyFrom }).
// Account host only, same-origin JSON only. A save based on an old version answers 409 { status: "conflict", current } so the page can show what changed.
const NO_STORE = { "cache-control": "no-store" };

export async function PUT(request: Request, { params }: { params: Promise<{ productKey: string }> }) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  const result = await saveMyProductBillingProfile(await getSession(), (await params).productKey, body);
  if (result.ok) return Response.json({ status: "ok", profile: result.profile }, { headers: NO_STORE });
  if (result.reason === "conflict" && "current" in result) return Response.json({ status: "conflict", current: result.current }, { status: 409, headers: NO_STORE });
  return Response.json({ status: result.reason, ...(result.fields ? { fields: result.fields } : {}), ...(result.reason === "rejected" && result.message ? { message: result.message } : {}) }, { status: profileStatus(result.reason), headers: NO_STORE });
}
