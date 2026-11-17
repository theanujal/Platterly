import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { PLATFORM_PROVIDER_ID, safeNextPath } from "@/lib/platform/config";

// Starts a central sign-in: builds the authorization address (PKCE, state and nonce are made and remembered by Better Auth) and sends the browser there.
// `?next=` is a path on this site only (the invitation page uses it to come back to itself). A person who has no Caterly user yet is created one and sent
// to the onboarding wizard, as Caterly's own sign-up always did.
export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get("next");
  const next = safeNextPath(asked);
  // Someone sent here to come back to a page (an invitation) returns to it even when this is their first time; otherwise a new person starts onboarding.
  const firstTime = asked && next === asked ? next : "/kitchenlogin/onboarding";
  const result = await auth.api.signInSocial({
    body: { provider: PLATFORM_PROVIDER_ID, callbackURL: next, newUserCallbackURL: firstTime, errorCallbackURL: "/", disableRedirect: true },
    headers: request.headers,
  });
  // The central sign-in could not be started (for example Platterly's sign-in is down): say so on the sign-in page instead of sending the person round in a circle.
  if (!result?.url) return NextResponse.redirect(new URL("/?error=provider_unavailable", request.url), 303);
  // A paid-plan button on the pricing page sends the plan with it (`?plan=premium&interval=ANNUAL`): it rides on the authorization address to the central sign-in, which
  // signs it, so the Account knows this sign-up chose a plan and sends the person to pay in the Store (docs/paid-plan-signup-plan.md). Anything malformed is a trial sign-up.
  const target = new URL(result.url);
  const params = new URL(request.url).searchParams;
  const plan = params.get("plan");
  const interval = params.get("interval");
  if (plan && /^[a-z0-9_-]{1,60}$/.test(plan) && (interval === "MONTHLY" || interval === "ANNUAL")) {
    target.searchParams.set("plan", plan);
    target.searchParams.set("interval", interval);
  }
  // A team invitation sends the person here to create an account only so they can join the inviter's business: the mark rides on the signed address too, so the
  // Account makes no business of their own for it (the same rule `provisionTenantForNewUser` applies to Caterly's own tenant).
  if (asked && next === asked && /^\/invitations\/[^/?#]+\/accept$/.test(next)) target.searchParams.set("invite", "1");
  const response = NextResponse.redirect(target, 303);
  response.headers.set("cache-control", "no-store");
  return response;
}
