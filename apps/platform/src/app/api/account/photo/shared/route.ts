import { hostKind, requestHost } from "@/lib/routing/hosts";
import { identityPool } from "@/modules/auth/identity-db";
import { readPhotoVersion } from "@/modules/account/photo";
import { verifyPhotoLink } from "@/modules/account/photo-link";

// GET /api/account/photo/shared?u=&v=&s=: a person's profile photo for other Platterly products, by signed address (see photo-link.ts). No session needed;
// the signature is the permission. A wrong or stale address is a plain 404, the same for "no such person" and "photo changed".
export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const q = new URL(request.url).searchParams;
  const [u, v, s] = [q.get("u") ?? "", q.get("v") ?? "", q.get("s") ?? ""];
  const miss = () => Response.json({ status: "none" }, { status: 404, headers: { "cache-control": "no-store" } });
  if (!verifyPhotoLink(u, v, s)) return miss();
  try {
    const photo = await readPhotoVersion(identityPool(), u, v);
    if (!photo) return miss();
    return new Response(new Uint8Array(photo.bytes), { headers: { "content-type": photo.type, "x-content-type-options": "nosniff", "cache-control": "public, max-age=300", "content-security-policy": "default-src 'none'; sandbox", "cross-origin-resource-policy": "cross-origin" } });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
