import { accountOrigin } from "@/modules/auth/config";
import { auditAuthEvent } from "@/modules/auth/audit";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { revokeAllDevices, revokeDevice } from "@/modules/account/devices";
import { identityPool } from "@/modules/auth/identity-db";
import { COOKIES } from "@/modules/auth/config";
import { cookieOptions } from "@/modules/auth/cookies";

// POST /api/account/sessions/revoke  {"id": "<session id>"} or {"all": true}. Account host, same-origin JSON only (a cross-site page cannot end sessions).
// Ends only the caller's own sessions. When the current session is ended, the Account cookie is cleared in the same response.
export async function POST(request: Request) {
  const headers = { "cache-control": "no-store" };
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers });
  const body = (await request.json().catch(() => null)) as { id?: unknown; all?: unknown } | null;
  try {
    const result = body?.all === true ? await revokeAllDevices(identityPool(), ref.sub) : typeof body?.id === "string" ? await revokeDevice(identityPool(), ref.sub, ref.sid, body.id) : null;
    if (!result) return Response.json({ error: "bad_request" }, { status: 400, headers });
    if (!result.ok) return Response.json({ status: "not_found" }, { status: 404, headers });
    await auditAuthEvent({ action: "auth.sign_out", outcome: "done", userId: ref.session.userId, reasonCode: body?.all === true ? "all_sessions" : "one_session" });
    const response = Response.json({ status: "ok", ended: result.ended, signedOut: result.signedOut }, { headers });
    if (result.signedOut) response.headers.append("set-cookie", `${COOKIES.accountSession}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${cookieOptions(0).secure ? "; Secure" : ""}`);
    return response;
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers });
  }
}
