import { NextResponse } from "next/server";
import { verifyRequest } from "@platterly/contract";
import { buildBundle } from "@/modules/site-content/site-content";
import { siteSecret } from "@/modules/site-content/publish";

export const dynamic = "force-dynamic";

/** GET: everything the marketing site builds from. Signed by the site's build with SITE_SECRET (an empty body is signed). */
export async function GET(request: Request) {
  const secret = siteSecret();
  if (!secret) return NextResponse.json({ error: "Not switched on." }, { status: 404 });
  const verified = verifyRequest([secret], request.headers, "");
  if (!verified.ok) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  return NextResponse.json(await buildBundle(), { headers: { "cache-control": "no-store" } });
}
