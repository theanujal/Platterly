import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSession, getSessionRef } from "@/lib/session";
import { getProfile } from "@/modules/account/profile";
import { identityPool } from "@/modules/auth/identity-db";
import { loadMyBillingProfilesPage } from "@/modules/store/product-billing-profiles";
import { profileStatus } from "@/modules/store/billing-profile";

// GET /api/account/billing-profiles: the signed-in Admin's own business's billing profiles, one per product. Account host only; no parameter names a business.
const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const result = await loadMyBillingProfilesPage(await getSession());
  if (!result.ok) return Response.json({ status: result.reason }, { status: profileStatus(result.reason), headers: NO_STORE });
  // The billing contact starts as the person's own details from sign-up; never stored from here.
  let prefill: { contactName: string; contactEmail: string; contactPhone: string } | null = null;
  try {
    const ref = await getSessionRef();
    const profile = ref ? await getProfile(identityPool(), ref.sub) : null;
    if (profile) prefill = { contactName: profile.name, contactEmail: profile.email, contactPhone: profile.phone };
  } catch {
    /* the contact fields simply start empty */
  }
  return Response.json({ status: "ok", ...result.page, prefill }, { headers: NO_STORE });
}
