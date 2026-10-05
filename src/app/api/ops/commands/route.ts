import { authoriseOps, signedJson } from "@/modules/ops-link/respond";
import { handleCommand } from "@/modules/ops-link/commands";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

/** POST: a command from ops (suspend, snapshot push, ...). Signed; a repeated command id is answered, not run again. */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return Response.json({ error: "body too large" }, { status: 413 });
  const auth = await authoriseOps(request);
  if ("response" in auth) return auth.response;
  if (auth.rawBody.length > MAX_BODY_BYTES) return Response.json({ error: "body too large" }, { status: 413 });
  const reply = await handleCommand(auth.rawBody);
  return signedJson(auth.config, reply.body, reply.status);
}
