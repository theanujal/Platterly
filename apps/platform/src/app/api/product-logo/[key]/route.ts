import { hostKind, requestHost } from "@/lib/routing/hosts";
import { loadProductLogo } from "@/modules/account/product-cards";

// GET /api/product-logo/{key}: a product's logo, as Ops has it, for pages a signed-out person can see (the product's sign-in page) and for the product's own
// screens. Public on purpose (a logo is not private), but only the logo of a product card Ops is showing is ever served, never the rest of Ops's picture library.
const KEY = /^[a-z][a-z0-9-]{1,31}$/;

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  if (hostKind(requestHost(request.headers)) === "other") return Response.json({ error: "not_found" }, { status: 404 });
  const { key } = await context.params;
  if (!KEY.test(key)) return Response.json({ error: "not_found" }, { status: 404 });
  const logo = await loadProductLogo(key);
  if (!logo) return Response.json({ error: "not_found" }, { status: 404 });
  return new Response(new Uint8Array(logo.bytes), { headers: { "content-type": logo.mime, "cache-control": "public, max-age=60", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "cross-origin" } });
}
