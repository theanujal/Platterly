import { receiveEvent } from "@/modules/directory/events";

const MAX_BODY_BYTES = 64 * 1024;

/** Products post their events here (docs/ops-contract.md section 7). Signed; see receiveEvent. */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return Response.json({ error: "body too large" }, { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return Response.json({ error: "body too large" }, { status: 413 });
  const reply = await receiveEvent(rawBody, request.headers);
  return Response.json(reply.body, { status: reply.status });
}
