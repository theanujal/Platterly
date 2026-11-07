import { pool } from "@/lib/db";
import { handleBackchannelLogout } from "@/lib/logout";
import { providerKeys } from "@/lib/oidc";

// POST form-encoded `logout_token`. 200 when the sessions were ended (even if none were left), 400 for anything invalid or replayed.
export async function POST(request: Request) {
  const headers = { "cache-control": "no-store" };
  const outcome = await handleBackchannelLogout({ pool: pool(), body: await request.text(), key: providerKeys() });
  return outcome.status === 200 ? Response.json({ status: "ok", ended: outcome.ended }, { headers }) : Response.json({ error: outcome.error }, { status: 400, headers });
}
