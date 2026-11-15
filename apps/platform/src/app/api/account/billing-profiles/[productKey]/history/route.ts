import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSession } from "@/lib/session";
import { profileStatus } from "@/modules/store/billing-profile";
import { loadMyProductBillingProfileHistory } from "@/modules/store/product-billing-profiles";

// GET /api/account/billing-profiles/{productKey}/history: the changes made to one product's billing profile, for the signed-in Admin's own business. Account host only.
export async function GET(request: Request, { params }: { params: Promise<{ productKey: string }> }) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const result = await loadMyProductBillingProfileHistory(await getSession(), (await params).productKey);
  if (!result.ok) return Response.json({ status: result.reason }, { status: profileStatus(result.reason), headers: { "cache-control": "no-store" } });
  return Response.json({ status: "ok", history: result.history }, { headers: { "cache-control": "no-store" } });
}
