import { prisma } from "@/lib/db";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { writeAudit } from "@/modules/audit/write-audit";
import { accountOrigin } from "@/modules/auth/config";
import { identityPool } from "@/modules/auth/identity-db";
import { emitCurrentPersonProfile } from "@/modules/outbox/person-profile";
import { getProfile, saveProfile, timeZones, validateProfile } from "@/modules/account/profile";

// GET /api/account/profile: the signed-in person's own profile. PATCH: change first name, last name, phone, time zone and the product-updates choice. Account host only.
// The person is whoever the verified session says; no body or query field names a user. PATCH takes same-origin JSON only.
const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  try {
    const profile = await getProfile(identityPool(), ref.sub);
    if (!profile) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
    return Response.json({ status: "ok", profile, timeZones: timeZones() }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

export async function PATCH(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  // Only these fields can change here. Anything else in the body (an email, an id) is ignored.
  const checked = validateProfile({ firstName: body.firstName, lastName: body.lastName, phone: body.phone, timeZone: body.timeZone, notifyProductUpdates: body.notifyProductUpdates });
  if (!checked.ok) return Response.json({ status: "invalid", errors: checked.errors }, { status: 422, headers: NO_STORE });
  if (Object.keys(checked.clean).length === 0) return Response.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  try {
    const profile = await saveProfile(identityPool(), ref.sub, checked.clean);
    if (!profile) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
    await audit(ref.session.userId, Object.keys(checked.clean));
    await emitCurrentPersonProfile(ref.sub);
    return Response.json({ status: "ok", profile }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

/** Which fields changed is recorded, never their values. A failure to write the audit row never undoes the change; it is logged. */
async function audit(userId: string, fields: string[]) {
  try {
    await prisma.$transaction((tx) =>
      writeAudit(tx, { action: "account.profile_updated", outcome: "done", initiator: { kind: "user", ref: userId }, executor: { kind: "system", ref: "account" }, subject: { type: "user", id: userId }, payload: { fields } }),
    );
  } catch (error) {
    console.error("profile audit write failed", error instanceof Error ? error.message : "unknown");
  }
}
