import { prisma } from "@/lib/db";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { buildHeaderSummary } from "@/modules/account/header-summary";
import { loadAccountOverview } from "@/modules/account/overview";
import { loadAccountProductCards } from "@/modules/account/product-cards";
import { getProfile } from "@/modules/account/profile";
import { corsHeaders } from "@/modules/account/site-origins";
import { accountOrigin } from "@/modules/auth/config";
import { identityPool } from "@/modules/auth/identity-db";

// GET /api/account/header: what the marketing site's header shows for a signed-in visitor (name, initials, photo, the products they can open). Account host
// only. Only the site's own pages may read it with the person's cookie (CORS allow-list), and nothing in the address names a person: it is whoever the verified
// session says. A visitor who is not signed in gets a plain 200 "signed_out" so the site's console stays quiet; the page never learns anything else.
export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const headers = corsHeaders(request.headers.get("origin"));
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "signed_out" }, { headers });
  try {
    const result = await loadAccountOverview(prisma, ref.session);
    if (result.status !== "ok") return Response.json({ status: "signed_out" }, { headers });
    const overview = result.overview;
    const profile = await getProfile(identityPool(), ref.sub).catch(() => null);
    if (profile?.name) overview.user.name = profile.name;
    const cards = await loadAccountProductCards().catch(() => ({ status: "unavailable" as const }));
    const photoUrl = profile?.photoVersion ? `${accountOrigin()}/api/account/photo?v=${profile.photoVersion}` : null;
    return Response.json(buildHeaderSummary({ overview, cards: cards.status === "ok" ? cards.cards : [], photoUrl, accountUrl: `${accountOrigin()}/` }), { headers });
  } catch {
    return Response.json({ status: "signed_out" }, { headers });
  }
}

/** A browser may ask first; the answer is the same allow-list, with no body. */
export async function OPTIONS(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return new Response(null, { status: 404 });
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}
