import { timingSafeEqual } from "node:crypto";
import { sweepPaidSignupsNow } from "@/modules/organisations/paid-signup-run";

// The scheduled check for paid-plan sign-ups (docs/paid-plan-signup-plan.md). POST only; callers send `Authorization: Bearer <CRON_SECRET>`. It completes every sign-up Ops says is
// paid (a person may pay and close the browser) and only then abandons the unpaid ones whose 24-hour payment window has ended. Safe to call as often as you like.
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) return Response.json({ error: "unauthorised" }, { status: 401 });
  return Response.json(await sweepPaidSignupsNow());
}
