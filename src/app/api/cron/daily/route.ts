import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { runDueNotifications } from "@/modules/notifications/triggers";
import { generateDueRecurringExpenses } from "@/modules/expenses/recurring";

/**
 * The one scheduled job (Chunk 16): event reminders, payment due / overdue notices and repeating expenses.
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
  return NextResponse.json({ ranAt: now.toISOString(), notifications, recurringExpenses });
}

export const GET = run;
export const POST = run;
