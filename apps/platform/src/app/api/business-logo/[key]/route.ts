import { hostKind, requestHost } from "@/lib/routing/hosts";
import { readLogo } from "@/modules/account/business-logo";

// GET /api/business-logo/{key}: a business's logo, so a product can show it. Public on purpose (the product's own pages show it to anyone), but the key is
// random and unlisted. Served as an image only, never as a page.
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const logo = await readLogo((await params).key);
  if (!logo) return Response.json({ error: "not_found" }, { status: 404 });
  return new Response(new Uint8Array(logo.bytes), { headers: { "content-type": logo.type, "x-content-type-options": "nosniff", "cache-control": "public, max-age=300", "content-security-policy": "default-src 'none'; sandbox" } });
}
