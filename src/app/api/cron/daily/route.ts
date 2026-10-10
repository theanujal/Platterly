import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { runDueNotifications } from "@/modules/notifications/triggers";
import { generateDueRecurringExpenses } from "@/modules/expenses/recurring";
import { scrubOldVisits } from "@/modules/storefront-visits/visits";
import { runOpsLinkJobs } from "@/modules/ops-link/events";
import { runLibraryScanIfDue } from "@/modules/library/scan";

/**
 * The one scheduled job (Chunk 16): event reminders, payment due / overdue notices, repeating expenses and the 90-day clean-up of storefront visitor IPs.
 * A server cron (or any scheduler) calls it every ~10 minutes:
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://catering.platterly.in/api/cron/daily
 * Safe to call as often as you like: every message and every booked expense is idempotent. Without CRON_SECRET
 * set it answers 404, so a forgotten setting never leaves it open.
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
  if (!process.env.CRON_SECRET) return new NextResponse("Not found", { status: 404 });
  if (!authorised(request)) return new NextResponse("Unauthorized", { status: 401 });

  const now = new Date();
  const notifications = await runDueNotifications(now);
  let recurringExpenses = 0;
  for (const org of await prisma.recurringExpense.findMany({ where: { isActive: true }, select: { organizationId: true }, distinct: ["organizationId"] })) {
    recurringExpenses += await generateDueRecurringExpenses(org.organizationId, now);
  }
  const visitsScrubbed = await scrubOldVisits(now);
  // Ops link: pending events, the catch-up sign-ups and the daily usage report (a no-op until OPS_* is configured).
  const opsLink = await runOpsLinkJobs(now);
  // The library scan: what kitchens added that Platterly's library lacks, for review in Ops. About once a day; never fails the cron.
  const libraryScan = await runLibraryScanIfDue(now).catch((error) => {
    console.error("[library] scan failed:", error);
    return { ran: false, scanned: 0, candidates: 0 };
  });
  return NextResponse.json({ ranAt: now.toISOString(), opsLink, notifications, recurringExpenses, visitsScrubbed, library: libraryScan });
}

export const GET = run;
export const POST = run;
