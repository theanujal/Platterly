import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { listDevices } from "@/modules/account/devices";
import { identityPool } from "@/modules/auth/identity-db";

// GET /api/account/sessions: the signed-in person's own devices. Account host only. The person is whoever the verified session says.
export async function GET(request: Request) {
  const headers = { "cache-control": "no-store" };
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers });
  try {
    return Response.json({ status: "ok", devices: await listDevices(identityPool(), ref.sub, ref.sid) }, { headers });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers });
  }
}
