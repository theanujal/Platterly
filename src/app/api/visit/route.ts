import { NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { pickClientIp } from "@/modules/storefront-visits/visit-math";
import { recordVisit } from "@/modules/storefront-visits/visits";

/**
 * The storefront's page beacon (Chunk 22): "someone opened this kitchen's link". Anonymous, so it is rate limited per
 * address and always answers 200 with `{ visitId }` (null when nothing was recorded), never revealing why.
 */
export async function POST(request: Request) {
  const ip = pickClientIp(request.headers) ?? "unknown";
  if (isRateLimited(`visit:${ip}`, 60, 60 * 60 * 1000)) return NextResponse.json({ visitId: null });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ visitId: null });
  }
  if (typeof body.slug !== "string" || body.slug.length > 60) return NextResponse.json({ visitId: null });
  try {
    const visitId = await recordVisit(
      { slug: body.slug, src: body.src, referrer: typeof body.referrer === "string" ? body.referrer : null, embedded: body.embedded === true, ancestor: typeof body.ancestor === "string" ? body.ancestor : null },
      request.headers,
    );
    return NextResponse.json({ visitId });
  } catch (error) {
    console.error("[visit] could not record:", error);
    return NextResponse.json({ visitId: null });
  }
}
