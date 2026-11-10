import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { listTrustedDevices, removeAllTrustedDevices, removeTrustedDevice } from "@/modules/account/trusted-devices";
import { accountOrigin } from "@/modules/auth/config";
import { identityPool } from "@/modules/auth/identity-db";

const NO_STORE = { "cache-control": "no-store" };

// GET /api/account/trusted-devices: the signed-in person's own trusted devices. POST {"id": "..."} or {"all": true} removes one or all of them (same-origin JSON only).
// Account host only. The person is whoever the verified session says; nobody else's device can be listed or removed.
export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  try {
    return Response.json({ status: "ok", devices: await listTrustedDevices(identityPool(), ref.sub) }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { id?: unknown; all?: unknown } | null;
  try {
    if (body?.all === true) return Response.json({ status: "ok", removed: await removeAllTrustedDevices(identityPool(), ref.sub) }, { headers: NO_STORE });
    if (typeof body?.id !== "string") return Response.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
    if (!(await removeTrustedDevice(identityPool(), ref.sub, body.id))) return Response.json({ status: "not_found" }, { status: 404, headers: NO_STORE });
    return Response.json({ status: "ok", removed: 1 }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}
