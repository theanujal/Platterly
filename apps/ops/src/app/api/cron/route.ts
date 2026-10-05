import { timingSafeEqual } from "node:crypto";
import { runDueCommands } from "@/modules/commands/outbox";
import { runDueMessages } from "@/modules/messages/messages";
import { syncNotices } from "@/modules/notices/notices";
import { refreshDueSnapshots } from "@/modules/snapshots/issue";
import { sendTrialNotices, sweepExpired } from "@/modules/subscriptions/subscriptions";

/**
 * Ops's one scheduled job. A server cron calls it every minute or two:
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://ops.platterly.in/api/cron
 * It marks ended trials and paid periods as locked, refreshes entitlement snapshots older than a day, and queues the sidebar notice for businesses that joined after it was sent, sends commands
 * that have come due (retries), and sends owner emails that are due (first attempts that were interrupted, and retries). Safe to call as often as you like. `?product=<key>` runs it for one product only. Without CRON_SECRET set it answers
 * 404, so a forgotten setting never leaves it open.
 */
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from((request.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const wanted = Buffer.from(secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

async function run(request: Request) {
  if (!process.env.CRON_SECRET) return new Response("Not found", { status: 404 });
  if (!authorised(request)) return new Response("Unauthorized", { status: 401 });
  const now = new Date();
  const product = new URL(request.url).searchParams.get("product") ?? undefined;
  const locked = await sweepExpired(now, product);
  const snapshotsRefreshed = await refreshDueSnapshots(now, 200, product);
  const trialNotices = await sendTrialNotices(now, product);
  const noticesQueued = await syncNotices(product);
  const commandsSent = await runDueCommands(now, 50, product);
  const messagesSent = await runDueMessages(now);
  return Response.json({ ranAt: now.toISOString(), locked, snapshotsRefreshed, trialNotices, noticesQueued, commandsSent, messagesSent });
}

export const GET = run;
export const POST = run;
