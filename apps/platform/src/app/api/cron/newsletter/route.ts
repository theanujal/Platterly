import { timingSafeEqual } from "node:crypto";
import { identityPool } from "@/modules/auth/identity-db";
import { runNewsletter } from "@/modules/newsletter/send";

// Scheduled job for the newsletter (AJ, 2026-11-10). POST only; callers send `Authorization: Bearer <CRON_SECRET>`. Each call asks Ops for the next issue that is due,
// mails one batch (NEWSLETTER_BATCH, default 100) to the people who have the newsletter on, and answers how many. Safe to call as often as you like: nobody is mailed twice.
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) return Response.json({ error: "unauthorised" }, { status: 401 });
  return Response.json(await runNewsletter(identityPool()));
}
