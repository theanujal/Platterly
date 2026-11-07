import { eventSecrets } from "@/lib/config";
import { pool } from "@/lib/db";
import { handleEvent } from "@/lib/events";

// Platform -> product event delivery. The raw body is read once and verified exactly as received.
export async function POST(request: Request) {
  const headers = { "cache-control": "no-store" };
  const outcome = await handleEvent({ pool: pool(), secrets: eventSecrets(), headers: request.headers, rawBody: await request.text(), method: "POST", url: request.url });
  return outcome.status === 200 ? Response.json({ status: "ok", applied: outcome.applied }, { headers }) : Response.json({ error: outcome.error }, { status: outcome.status, headers });
}
