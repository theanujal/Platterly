import { NextResponse } from "next/server";
import { verifyRequest } from "@platterly/contract";
import { recordPublishResult, siteSecret } from "@/modules/site-content/publish";

export const dynamic = "force-dynamic";

/** POST { publishId, ok, message? }: the deploy script's answer, signed with SITE_SECRET over the raw body. */
export async function POST(request: Request) {
  const secret = siteSecret();
  if (!secret) return NextResponse.json({ error: "Not switched on." }, { status: 404 });
  const raw = await request.text();
  if (!verifyRequest([secret], request.headers, raw).ok) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  let data: { publishId?: unknown; ok?: unknown; message?: unknown };
  try { data = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  if (typeof data.publishId !== "string" || typeof data.ok !== "boolean") return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const updated = await recordPublishResult(data.publishId, data.ok, typeof data.message === "string" ? data.message : null);
  return NextResponse.json({ ok: true, updated });
}
