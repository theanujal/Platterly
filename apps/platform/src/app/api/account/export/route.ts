import { prisma } from "@/lib/db";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { loadAccountOverview } from "@/modules/account/overview";
import { buildExport, type ExportBusiness } from "@/modules/account/data-rights";
import { confirmPassword } from "@/modules/account/confirm-password";
import { accountOrigin } from "@/modules/auth/config";
import { identityPool } from "@/modules/auth/identity-db";
import { idp } from "@/modules/auth/idp";

// POST /api/account/export {"password": "..."}: a JSON download of the person's own identity data. The current password is asked again first. Account host,
// same-origin JSON only. The file holds no password hash, token or other person's data.
const NO_STORE = { "cache-control": "no-store" };
const STATUS = { wrong_password: 403, no_password: 409, too_many_attempts: 429 } as const;

export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  try {
    const checked = await confirmPassword(identityPool(), (await idp().$context).password, ref.sub, body?.password);
    if (checked !== "ok") return Response.json({ status: checked }, { status: STATUS[checked], headers: NO_STORE });
    const overview = await loadAccountOverview(prisma, ref.session);
    const business: ExportBusiness = overview.status === "ok" && overview.overview.business.state === "ok" ? { name: overview.overview.business.business.name, role: overview.overview.business.business.role, status: overview.overview.business.business.status } : null;
    const data = await buildExport(identityPool(), ref.sub, ref.sid, business);
    if (!data) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
    return new Response(JSON.stringify(data, null, 2), { headers: { ...NO_STORE, "content-type": "application/json", "content-disposition": 'attachment; filename="platterly-my-data.json"', "x-content-type-options": "nosniff" } });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}
