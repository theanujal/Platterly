import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { getPreferences, setPreferences } from "@/modules/account/notification-preferences";
import { accountOrigin } from "@/modules/auth/config";
import { identityPool } from "@/modules/auth/identity-db";

const NO_STORE = { "cache-control": "no-store" };

// GET /api/account/notifications: the signed-in person's own optional-notice choices. POST {"newSignInAlert": true, ...} changes the named ones (same-origin JSON only).
// Account host only; the person is whoever the verified session says.
export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  try {
    return Response.json({ status: "ok", preferences: await getPreferences(identityPool(), ref.sub) }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return Response.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  try {
    const preferences = await setPreferences(identityPool(), ref.sub, body);
    if (!preferences) return Response.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
    return Response.json({ status: "ok", preferences }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}
