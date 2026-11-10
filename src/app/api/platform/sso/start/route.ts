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
  const response = NextResponse.redirect(result.url, 303);
  response.headers.set("cache-control", "no-store");
  return response;
}
