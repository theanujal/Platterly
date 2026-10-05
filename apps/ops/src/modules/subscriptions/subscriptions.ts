import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { tellOwner } from "@/modules/messages/messages";
import { issueSnapshot, newSubscriptionId } from "@/modules/snapshots/issue";

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

/** A new business starts on the product's active trial plan. No trial plan configured: nothing is created. */
export async function startTrial(businessId: string, productKey: string, now: Date = new Date(), issue = true) {
  if (await prisma.subscription.findFirst({ where: { businessId, productKey, endDate: null } })) return null;
  const plan = await prisma.plan.findFirst({ where: { productKey, isTrial: true, isActive: true }, orderBy: { createdAt: "asc" } });
  if (!plan) return null;
  return assignPlan({ businessId, productKey, planId: plan.id, actorUserId: null, now, issue });
}

/**
 * The scheduled sweep: a trial past its end and a paid period past its end are marked LOCKED (so lists and reports show it),
 * and a fresh snapshot goes out. The product already locks by the dates in its own snapshot; this keeps ops's record true.
 * `productKey` limits the sweep to one product (the cron accepts it, and tests use it so they never touch real data).
 */
export async function sweepExpired(now: Date = new Date(), productKey?: string): Promise<number> {
  const due = await prisma.subscription.findMany({
    where: { endDate: null, ...(productKey ? { productKey } : {}), OR: [{ status: "TRIALING", trialEndsAt: { lte: now } }, { status: "ACTIVE", currentPeriodEnd: { lte: now } }] },
    select: { id: true, businessId: true, productKey: true, status: true },
  });
  for (const sub of due) {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: "LOCKED" } });
    await audit({ actorUserId: null, action: "subscription.locked", subject: sub.businessId, detail: { productKey: sub.productKey, subscriptionId: sub.id } });
    try {
      await issueSnapshot(sub.businessId, sub.productKey, now);
    } catch (error) {
      console.error("[ops subscriptions] could not issue after lock", sub.businessId, error);
    }
    if (sub.status === "TRIALING") await tellOwner({ businessId: sub.businessId, productKey: sub.productKey, template: "trial_ended", dedupeKey: `trial:${sub.id}:ended` });
  }
  return due.length;
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
    await tellOwner({ businessId: trial.businessId, productKey: trial.productKey, template: "trial_ending", variables: { daysLeft: stage }, dedupeKey: `trial:${trial.id}:${stage}` });
    sent += 1;
  }
  return sent;
}

export async function listSubscriptions(businessId: string) {
  return prisma.subscription.findMany({ where: { businessId }, include: { plan: { select: { name: true, code: true } }, product: { select: { name: true } } }, orderBy: { startDate: "desc" } });
}
