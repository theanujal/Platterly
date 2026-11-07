import { NextResponse } from "next/server";
import { createRemoteJWKSet } from "jose";
import { prisma } from "@/lib/db";
import { handlePlatformLogout } from "@/lib/platform/logout";
import { platformIssuer, platformSsoEnabled } from "@/lib/platform/config";

// POST form-encoded `logout_token` from the identity provider. 200 when handled (even if no session was left), 400 for anything invalid or replayed.
// Off (404) unless PLATFORM_SSO=1.
let keys: ReturnType<typeof createRemoteJWKSet> | undefined;

export async function POST(request: Request) {
  if (!platformSsoEnabled()) return new NextResponse("Not found", { status: 404 });
  const headers = { "cache-control": "no-store" };
  keys ??= createRemoteJWKSet(new URL(`${platformIssuer()}/jwks`));
  const outcome = await handlePlatformLogout({ db: prisma, body: await request.text(), key: keys });
  return outcome.status === 200 ? Response.json({ status: "ok", ended: outcome.ended }, { headers }) : Response.json({ error: outcome.error }, { status: 400, headers });
}
