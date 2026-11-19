import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { runDueNotifications } from "@/modules/notifications/triggers";
import { generateDueRecurringExpenses } from "@/modules/expenses/recurring";
import { scrubOldVisits } from "@/modules/storefront-visits/visits";
import { runOpsLinkJobs } from "@/modules/ops-link/events";
import { runDuePlatformOutbox } from "@/modules/platform-link/outbox";
import { runDuePlatformPull } from "@/modules/platform-link/pull";
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

  // One run at a time: a second run while one is busy would send the same messages again (#121). The transaction only holds the
  // lock; the jobs use the global client. pg_try_advisory_xact_lock is released on commit, rollback or connection loss, so no `finally`.
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended('catering-cron-daily', 0)) AS locked`;
      if (!locked) return NextResponse.json({ busy: true });
      return NextResponse.json(await runJobs());
    },
    { maxWait: 5_000, timeout: 15 * 60_000 },
  );
}

async function runJobs() {
  const now = new Date();
  const notifications = await runDueNotifications(now);
  let recurringExpenses = 0;
  for (const org of await prisma.recurringExpense.findMany({ where: { isActive: true }, select: { organizationId: true }, distinct: ["organizationId"] })) {
    recurringExpenses += await generateDueRecurringExpenses(org.organizationId, now);
  }
  const visitsScrubbed = await scrubOldVisits(now);
  // Ops link: pending events, the catch-up sign-ups and the daily usage report (a no-op until OPS_* is configured).
  const opsLink = await runOpsLinkJobs(now);
  // Messages to the Platform ("business created") that are due for a retry (a no-op until PLATFORM_ANSWER_SECRET is set; never fails the cron).
  const platformLink = await runDuePlatformOutbox(now).catch((error) => {
    console.error("[platform-link] outbox run failed:", error);
    return 0;
  });
  // The daily pull: ask the Platform for each business's membership and status and repair anything an event missed (once a day per business; never fails the cron).
  const platformPull = await runDuePlatformPull(now).catch((error) => {
    console.error("[platform-link] pull run failed:", error);
    return { checked: 0, repaired: 0, failed: 0 };
  });
  // The library scan: what kitchens added that Platterly's library lacks, for review in Ops. About once a day; never fails the cron.
  const libraryScan = await runLibraryScanIfDue(now).catch((error) => {
    console.error("[library] scan failed:", error);
    return { ran: false, scanned: 0, candidates: 0 };
  });
  return { ranAt: now.toISOString(), opsLink, platformLink, platformPull, notifications, recurringExpenses, visitsScrubbed, library: libraryScan };
}

export const GET = run;
export const POST = run;
