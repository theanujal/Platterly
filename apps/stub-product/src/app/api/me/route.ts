import { accessFor } from "@/lib/access";
import { pool } from "@/lib/db";
import { currentSession } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "cache-control": "no-store" };
  const session = await currentSession();
  if (!session) return Response.json({ status: "unauthenticated" }, { status: 401, headers });
  const access = await accessFor(pool(), session.sub);
  return Response.json({ status: "ok", sub: session.sub, email: session.email, allowed: access.allowed, memberships: access.memberships }, { headers });
}
