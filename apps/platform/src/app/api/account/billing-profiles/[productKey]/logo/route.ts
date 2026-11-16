import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSession, getSessionRef } from "@/lib/session";
import { identityPool } from "@/modules/auth/identity-db";
import { accountOrigin } from "@/modules/auth/config";
import { LOGO_MAX_BYTES, saveLogo } from "@/modules/account/business-logo";
import { billingAccess } from "@/modules/store/billing-rights";

// POST /api/account/billing-profiles/{productKey}/logo: the Admin uploads a logo (the raw image as the body, at most 4 MB). The answer is the logo's link; nothing
// is saved to the profile until the Admin saves the form. Account host only, same-origin only, business Admin only.
const NO_STORE = { "cache-control": "no-store" };
const REFUSALS = { too_large: 413, not_an_image: 415, empty: 400 } as const;

export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin()) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const access = await billingAccess(await getSession());
  if (access.status !== "ok") return Response.json({ status: access.status }, { status: access.status === "unauthenticated" ? 401 : access.status === "no_business" ? 409 : 403, headers: NO_STORE });
  if (Number(request.headers.get("content-length") ?? "0") > LOGO_MAX_BYTES + 1024) return Response.json({ status: "too_large" }, { status: 413, headers: NO_STORE });
  const saved = await saveLogo(new Uint8Array(await request.arrayBuffer()));
  if (!saved.ok) return Response.json({ status: saved.reason }, { status: REFUSALS[saved.reason], headers: NO_STORE });
  // Remember who uploaded the file so a permanent erase can delete it even if the form is never saved. Not worth failing an upload over.
  const ref = await getSessionRef();
  if (ref) await identityPool().query(`insert into "accountLogoUpload" ("key", "userId") values ($1, $2) on conflict do nothing`, [saved.key, ref.sub]).catch(() => undefined);
  return Response.json({ status: "ok", url: `${accountOrigin()}/api/business-logo/${saved.key}` }, { headers: NO_STORE });
}
