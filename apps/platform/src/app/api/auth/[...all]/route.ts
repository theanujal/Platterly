import { isHost } from "@/modules/auth/host";
import { idp } from "@/modules/auth/idp";

// The identity provider's HTTP API (sign-up, sign-in, OTP, OIDC discovery, authorize, token, JWKS, userinfo). Auth host only; 404 on every other host.
async function handle(request: Request) {
  if (!isHost(request, "auth")) return Response.json({ error: "not_found" }, { status: 404 });
  return idp().handler(request);
}

export const GET = handle;
export const POST = handle;
