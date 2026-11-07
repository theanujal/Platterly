import { NextResponse } from "next/server";
import { TX_COOKIE, TX_SECONDS, sessionSecret } from "@/lib/config";
import { beginSignIn } from "@/lib/oidc";
import { cookieFlags } from "@/lib/server";

export async function GET(request: Request) {
  const { authorizeUrl, transaction } = beginSignIn(sessionSecret(), new URL(request.url).searchParams.get("next"));
  const response = NextResponse.redirect(authorizeUrl, 303);
  response.cookies.set(TX_COOKIE, transaction, cookieFlags(TX_SECONDS));
  response.headers.set("cache-control", "no-store");
  return response;
}
