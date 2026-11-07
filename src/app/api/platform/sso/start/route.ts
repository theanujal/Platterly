import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { PLATFORM_PROVIDER_ID, platformSsoEnabled, safeNextPath } from "@/lib/platform/config";

// Starts a central sign-in: builds the authorization address (PKCE, state and nonce are made and remembered by Better Auth) and sends the browser there.
// Off unless PLATFORM_SSO=1. `?next=` is a path on this site only (the invitation page uses it to come back to itself).
export async function GET(request: Request) {
  if (!platformSsoEnabled()) return new NextResponse("Not found", { status: 404 });
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  const result = await auth.api.signInSocial({
    body: { provider: PLATFORM_PROVIDER_ID, callbackURL: next, errorCallbackURL: "/", disableRedirect: true },
    headers: request.headers,
  });
  if (!result?.url) return NextResponse.redirect(new URL("/?legacy=1", request.url), 303);
  const response = NextResponse.redirect(result.url, 303);
  response.headers.set("cache-control", "no-store");
  return response;
}
