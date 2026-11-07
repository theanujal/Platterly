import { hostKind, requestHost } from "@/lib/routing/hosts";
import { identityPool } from "@/modules/auth/identity-db";
import { idp } from "@/modules/auth/idp";
import { authOrigin } from "@/modules/auth/config";
import { recoveryAddressFor, recoveryDelivery, RESEND_SECONDS } from "@/modules/account/recovery-email";

// POST /api/recovery/send {"email": "<main email>"}: sends a password-reset code to that person's verified RECOVERY email, if they have one. Auth host only.
// The answer is always the same ("ok"), whether or not the address is registered or has a recovery email, so it cannot be used to find out who has an
// account. Resets for one address are held to one send per 55 seconds. The code is the provider's own reset code; the person then uses the normal reset page.
const NO_STORE = { "cache-control": "no-store" };
const lastSent = new Map<string, number>();

export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "auth") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== authOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const same = Response.json({ status: "ok" }, { headers: NO_STORE });
  if (!email || email.length > 254) return same;
  const now = Date.now();
  if (now - (lastSent.get(email) ?? 0) < RESEND_SECONDS * 1000) return same;
  if (lastSent.size > 1000) for (const [key, at] of lastSent) if (now - at > RESEND_SECONDS * 1000) lastSent.delete(key);
  lastSent.set(email, now);
  try {
    const found = await recoveryAddressFor(identityPool(), email);
    if (found) await recoveryDelivery.run({ to: found.to }, () => idp().api.forgetPasswordEmailOTP({ body: { email } }));
  } catch (error) {
    console.error("recovery send failed", error instanceof Error ? error.message : "unknown");
  }
  return same;
}
