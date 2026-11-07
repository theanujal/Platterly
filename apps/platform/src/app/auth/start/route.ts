import { NextResponse } from "next/server";
import { COOKIES } from "@/modules/auth/config";
import { cookieOptions } from "@/modules/auth/cookies";
import { surfaceOf } from "@/modules/auth/host";
import { beginSignIn } from "@/modules/auth/oidc-client";

// Account and Store hosts: start the sign-in. Sends the browser to the identity provider with PKCE, state and nonce; the secrets stay in a short-lived, signed,
// HttpOnly cookie scoped to /auth. `next` can only be a path on this host.
export async function GET(request: Request) {
  const surface = surfaceOf(request);
  if (!surface) return new NextResponse("Not found", { status: 404 });
  const secret = process.env.AUTH_SECRET;
  if (!secret) return new NextResponse("Sign-in is not configured", { status: 503 });
  const { authorizeUrl, transaction } = beginSignIn(secret, new URL(request.url).searchParams.get("next"), new Date(), surface);
  const response = NextResponse.redirect(authorizeUrl, 303);
  response.cookies.set(COOKIES.oidcTransaction, transaction, cookieOptions(600, "/auth"));
  response.headers.set("cache-control", "no-store");
  return response;
}
