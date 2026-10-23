import "server-only";
import { notifySafely } from "@/modules/notifications/notifications";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { tellOwner } from "@/modules/messages/messages";
import { stopAutoPay } from "@/modules/billing/billing";
import { priceBreakdown } from "@/modules/billing/math";
import { issueSnapshot, newSubscriptionId } from "@/modules/snapshots/issue";
import { PAID_GRACE_DAYS } from "@platterly/contract";

const DAY = 86_400_000;

export class SubscriptionError extends Error {}

/**
 * Ends the business's current subscription to the product (if any) and starts a new one on `planId`, in one transaction, so
 * there is never more than one current row. History is kept. A trial plan starts TRIALING with its end date; any other plan
 * assigned by hand starts ACTIVE with no period end (so it never locks by itself, as before). Then a fresh snapshot goes out.
 */
export async function assignPlan(input: { businessId: string; productKey: string; planId: string; actorUserId: string | null; now?: Date; /** false: do not send a snapshot (the caller sends the first one inside `business.provision`). */ issue?: boolean }) {
  const now = input.now ?? new Date();
  const [plan, link] = await Promise.all([
    prisma.plan.findUnique({ where: { id: input.planId } }),
    prisma.businessProduct.findUnique({ where: { businessId_productKey: { businessId: input.businessId, productKey: input.productKey } } }),
  ]);
  if (!link) throw new SubscriptionError("This business is not on that product.");
  if (!plan || plan.productKey !== input.productKey) throw new SubscriptionError("That plan does not belong to this product.");
  if (!plan.isActive) throw new SubscriptionError("That plan is retired.");

  const previous = await prisma.subscription.findFirst({ where: { businessId: input.businessId, productKey: input.productKey, endDate: null }, select: { plan: { select: { name: true } } } });
  const subscription = await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({ where: { businessId: input.businessId, productKey: input.productKey, endDate: null }, data: { status: "CANCELLED", endDate: now } });
    return tx.subscription.create({
      data: {
        id: newSubscriptionId(),
        businessId: input.businessId,
        productKey: input.productKey,
        planId: plan.id,
        status: plan.isTrial ? "TRIALING" : "ACTIVE",
        startDate: now,
        trialEndsAt: plan.isTrial && plan.trialDurationDays ? new Date(now.getTime() + plan.trialDurationDays * DAY) : null,
      },
    });
  });
  await audit({ actorUserId: input.actorUserId, action: "subscription.assigned", subject: input.businessId, detail: { productKey: input.productKey, planId: plan.id, planCode: plan.code, subscriptionId: subscription.id } });
  if (input.issue !== false) await issueSnapshot(input.businessId, input.productKey, now);
  // The trial that comes with sign-up is not "a change" (the welcome email covers it); any other plan is.
  if (!plan.isTrial) await tellOwner({ businessId: input.businessId, productKey: input.productKey, template: "plan_changed", variables: { planName: plan.name, ...(previous ? { previousPlanName: previous.plan.name } : {}) }, dedupeKey: `plan_changed:${subscription.id}` });
  return subscription;
}

/** The trial plan a new business starts on: the product's oldest active trial plan. Other trial plans are only assigned by hand. */
export function signupTrialPlan(productKey: string) {
  return prisma.plan.findFirst({ where: { productKey, isTrial: true, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, trialDurationDays: true } });
}

/** A new business starts on the product's active trial plan. No trial plan configured: nothing is created. */
export async function startTrial(businessId: string, productKey: string, now: Date = new Date(), issue = true) {
  if (await prisma.subscription.findFirst({ where: { businessId, productKey, endDate: null } })) return null;
  const plan = await signupTrialPlan(productKey);
  if (!plan) return null;
  return assignPlan({ businessId, productKey, planId: plan.id, actorUserId: null, now, issue });
}

/**
 * The scheduled sweep: a trial past its end, and a paid period past its end PLUS the 7-day payment grace (AJ, 2026-10-12), are
 * marked LOCKED (so lists and reports show it), and a fresh snapshot goes out. The product already locks by the dates in its
 * own snapshot; this keeps ops's record true. During the grace the subscription stays ACTIVE and `sendGraceNotices` warns.
 * `productKey` limits the sweep to one product (the cron accepts it, and tests use it so they never touch real data).
 */
export async function sweepExpired(now: Date = new Date(), productKey?: string): Promise<number> {
  const due = await prisma.subscription.findMany({
    where: { endDate: null, ...(productKey ? { productKey } : {}), OR: [{ status: "TRIALING", trialEndsAt: { lte: now } }, { status: "ACTIVE", currentPeriodEnd: { lte: new Date(now.getTime() - PAID_GRACE_DAYS * DAY) } }] },
    select: { id: true, businessId: true, productKey: true, status: true, razorpaySubscriptionId: true, autoPay: true },
  });
  for (const sub of due) {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: "LOCKED", ...(sub.razorpaySubscriptionId ? { autoPay: "CANCELLED" as const } : {}) } });
    // A locked kitchen is never charged by a late Razorpay retry: its auto-pay stops here, and it sets up again to come back.
    if (sub.razorpaySubscriptionId && sub.autoPay !== "CANCELLED") await stopAutoPay({ businessId: sub.businessId, productKey: sub.productKey, razorpaySubscriptionId: sub.razorpaySubscriptionId }, false);
    await audit({ actorUserId: null, action: "subscription.locked", subject: sub.businessId, detail: { productKey: sub.productKey, subscriptionId: sub.id } });
    try {
      await issueSnapshot(sub.businessId, sub.productKey, now);
    } catch (error) {
      console.error("[ops subscriptions] could not issue after lock", sub.businessId, error);
    }
    if (sub.status === "TRIALING") await notifySafely({ productKey: sub.productKey, businessId: sub.businessId, kind: "trial.ended", title: "A trial ended", body: "The trial ended without a paid plan, so the business is locked.", link: `/businesses/${sub.businessId}`, dedupeKey: `trial_ended:${sub.id}` });
    if (sub.status === "TRIALING") await tellOwner({ businessId: sub.businessId, productKey: sub.productKey, template: "trial_ended", dedupeKey: `trial:${sub.id}:ended` });
    if (sub.status === "ACTIVE") {
      await notifySafely({ productKey: sub.productKey, businessId: sub.businessId, kind: "plan.locked", severity: "WARNING", title: "A business was locked", body: "The plan was not renewed within the 7-day grace, so the business is locked.", link: `/businesses/${sub.businessId}`, dedupeKey: `plan_paused:${sub.id}` });
      await tellOwner({ businessId: sub.businessId, productKey: sub.productKey, template: "plan_locked", dedupeKey: `plan:${sub.id}:paused` });
    }
  }
  return due.length;
}

/**
 * Payment grace notices (AJ, 2026-10-12): a paid period has ended and the 7 days to renew are running. The owner is emailed
 * once when the period ends and once on the last day; the team is told once. Renewing moves the period end, which starts a
 * fresh set of keys. Returns how many were sent.
 */
export async function sendGraceNotices(now: Date = new Date(), productKey?: string): Promise<number> {
  const graceStart = new Date(now.getTime() - PAID_GRACE_DAYS * DAY);
  const subs = await prisma.subscription.findMany({
    where: { endDate: null, status: "ACTIVE", currentPeriodEnd: { lte: now, gt: graceStart }, ...(productKey ? { productKey } : {}) },
    select: { id: true, businessId: true, productKey: true, currentPeriodEnd: true, autoPay: true },
  });
  let sent = 0;
  for (const sub of subs) {
    const endsAt = new Date(sub.currentPeriodEnd!.getTime() + PAID_GRACE_DAYS * DAY);
    const daysLeft = Math.max(Math.ceil((endsAt.getTime() - now.getTime()) / DAY), 1);
    const stage = daysLeft <= 1 ? "last" : "started";
    const key = `${sub.id}:${sub.currentPeriodEnd!.getTime()}:${stage}`;
    const endsOn = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(endsAt);
    if (stage === "started") {
      await notifySafely({ productKey: sub.productKey, businessId: sub.businessId, kind: "plan.overdue", severity: "WARNING", title: "A plan payment is overdue", body: `The paid period ended. The business has ${daysLeft} day${daysLeft === 1 ? "" : "s"} to renew before it is locked.`, link: `/businesses/${sub.businessId}`, dedupeKey: `plan_overdue:${key}` });
    }
    await tellOwner({ businessId: sub.businessId, productKey: sub.productKey, template: "plan_grace", variables: { daysLeft, endsOn, ...(sub.autoPay === "PAUSED" ? { paused: 1 } : {}) }, dedupeKey: `plan_grace:${key}` });
    sent += 1;
  }
  return sent;
}

/**
 * Trial notices: "ends in 3 days" and "ends in 1 day", once each (the dedupe key holds the stage, so a daily or minutely job
 * never repeats one). The "has ended" notice goes out when the sweep above locks the trial.
 */
export async function sendTrialNotices(now: Date = new Date(), productKey?: string): Promise<number> {
  const trials = await prisma.subscription.findMany({
    where: { endDate: null, status: "TRIALING", trialEndsAt: { gt: now, lte: new Date(now.getTime() + 3 * DAY) }, ...(productKey ? { productKey } : {}) },
    select: { id: true, businessId: true, productKey: true, trialEndsAt: true },
  });
  let sent = 0;
  for (const trial of trials) {
    const daysLeft = Math.ceil((trial.trialEndsAt!.getTime() - now.getTime()) / DAY);
    const stage = daysLeft <= 1 ? 1 : 3;
    await notifySafely({ productKey: trial.productKey, businessId: trial.businessId, kind: "trial.ending", severity: "WARNING", title: stage === 1 ? "A trial ends tomorrow" : "A trial ends in 3 days", body: "No paid plan yet. The business has been emailed.", link: `/businesses/${trial.businessId}`, dedupeKey: `trial_ending:${trial.id}:${stage}` });
    await tellOwner({ businessId: trial.businessId, productKey: trial.productKey, template: "trial_ending", variables: { daysLeft: stage }, dedupeKey: `trial:${trial.id}:${stage}` });
    sent += 1;
  }
  return sent;
}

const IST_OFFSET = 5.5 * 3_600_000;
const istDay = (d: Date) => Math.floor((d.getTime() + IST_OFFSET) / DAY);
const istHour = (d: Date) => new Date(d.getTime() + IST_OFFSET).getUTCHours();

/**
 * Renewal reminders for every paid plan (Sharath, 2026-10-23), in Asia/Kolkata calendar days, by email and WhatsApp:
 *   auto-pay on: 7 days before, "we will charge"; on the day from 8 am, "charging today". A charge before 8 am moves the
 *                period on, so that day only gets the payment confirmation.
 *   paid by hand (monthly, yearly, paused or halted auto-pay, or a downgrade waiting): 7 days before and on the day; yearly also
 *                30 days and 1 day before, by email only.
 * A plan assigned by hand (no billing interval) gets none. The key holds the period end and the stage, so each goes once a
 * cycle. After the end, the grace notices take over.
 */
export async function sendRenewalReminders(now: Date = new Date(), productKey?: string): Promise<number> {
  const subs = await prisma.subscription.findMany({
    where: { endDate: null, status: "ACTIVE", billingInterval: { not: null }, currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + 31 * DAY) }, ...(productKey ? { productKey } : {}) },
    select: { id: true, businessId: true, productKey: true, currentPeriodEnd: true, billingInterval: true, autoPay: true, pendingPlanId: true, razorpaySubscriptionId: true, plan: { select: { name: true, priceMonthly: true, gstPercent: true } } },
  });
  let sent = 0;
  for (const sub of subs) {
    const end = sub.currentPeriodEnd!;
    const yearly = sub.billingInterval === "ANNUAL";
    const daysLeft = istDay(end) - istDay(now);
    const stage = daysLeft === 0 ? (istHour(now) >= 8 ? 0 : null) : daysLeft === 1 ? (yearly ? 1 : null) : daysLeft <= 7 ? 7 : yearly && daysLeft <= 30 ? 30 : null;
    if (stage === null) continue;
    const endsOn = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(end);
    const base = { businessId: sub.businessId, productKey: sub.productKey };
    if (!yearly && sub.autoPay === "ACTIVE" && !sub.pendingPlanId) {
      const lastPaid = sub.razorpaySubscriptionId ? await prisma.subscriptionPayment.findFirst({ where: { razorpaySubscriptionId: sub.razorpaySubscriptionId, status: "PAID" }, orderBy: { createdAt: "desc" }, select: { total: true } }) : null;
      const amount = lastPaid ? Number(lastPaid.total) : priceBreakdown(Number(sub.plan.priceMonthly ?? 0), Number(sub.plan.gstPercent)).total;
      const template = stage === 0 ? "autopay_today" : "autopay_upcoming";
      await tellOwner({ ...base, template, variables: { planName: sub.plan.name, amount, chargeOn: endsOn }, dedupeKey: `${template}:${sub.id}:${end.getTime()}` });
    } else {
      await tellOwner({ ...base, template: "plan_renewal_due", variables: { daysLeft, endsOn, planName: sub.plan.name, ...(sub.autoPay === "PAUSED" ? { paused: 1 } : {}) }, dedupeKey: `renewal:${sub.id}:${end.getTime()}:${stage}`, emailOnly: stage === 1 || stage === 30 });
    }
    sent += 1;
  }
  return sent;
}

export async function listSubscriptions(businessId: string) {
  return prisma.subscription.findMany({ where: { businessId }, include: { plan: { select: { name: true, code: true } }, product: { select: { name: true } } }, orderBy: { startDate: "desc" } });
}
