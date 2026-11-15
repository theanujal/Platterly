import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { fetchOpsCardImage } from "@/modules/store/ops-catalogue";

// GET /api/account/product-image/{name}: an uploaded card picture, fetched from Ops with the signed read and passed on as an image. Account host only, signed-in only.
const NAME = /^[a-z0-9][a-z0-9._-]{0,120}$/;

export async function GET(request: Request, context: { params: Promise<{ name: string }> }) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (!(await getSessionRef())) return Response.json({ status: "unauthenticated" }, { status: 401 });
  const { name } = await context.params;
  if (!NAME.test(name) || name.includes("..")) return Response.json({ error: "not_found" }, { status: 404 });
  const image = await fetchOpsCardImage(name);
  if (!image.ok) return Response.json({ error: "not_found" }, { status: image.reason === "not_found" ? 404 : 502 });
  return new Response(new Uint8Array(image.bytes), { headers: { "content-type": image.mime, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
}
