import QRCode from "qrcode";
import { resolveToken } from "@/lib/secure-access/token";
import { canonicalUrl } from "@/lib/seo/canonical";

// The share link's QR as a PNG, so the "order approved" email can show it as a normal hosted picture. It encodes only the share link
// the token already is, and answers only for a live share token.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  if (!resolved || resolved.resourceType !== "ORDER_SHARE") return new Response("Not found", { status: 404 });
  const png = await QRCode.toBuffer(canonicalUrl(`/share/${token}`), { width: 320, margin: 1 });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600", "X-Robots-Tag": "noindex" } });
}
