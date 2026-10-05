import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { issueSnapshot, newSubscriptionId } from "@/modules/snapshots/issue";

const DAY = 86_400_000;

export class SubscriptionError extends Error {}

/**
 * Ends the business's current subscription to the product (if any) and starts a new one on `planId`, in one transaction, so
 * there is never more than one current row. History is kept. A trial plan starts TRIALING with its end date; any other plan
 * assigned by hand starts ACTIVE with no period end (so it never locks by itself, as before). Then a fresh snapshot goes out.
 */
export async function assignPlan(input: { businessId: string; productKey: string; planId: string; actorUserId: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  const [plan, link] = await Promise.all([
    prisma.plan.findUnique({ where: { id: input.planId } }),
    prisma.businessProduct.findUnique({ where: { businessId_productKey: { businessId: input.businessId, productKey: input.productKey } } }),
  ]);
  if (!link) throw new SubscriptionError("This business is not on that product.");
  if (!plan || plan.productKey !== input.productKey) throw new SubscriptionError("That plan does not belong to this product.");
  if (!plan.isActive) throw new SubscriptionError("That plan is retired.");

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
  await issueSnapshot(input.businessId, input.productKey, now);
  return subscription;
}

/** A new business starts on the product's active trial plan. No trial plan configured: nothing is created. */
export async function startTrial(businessId: string, productKey: string, now: Date = new Date()) {
  if (await prisma.subscription.findFirst({ where: { businessId, productKey, endDate: null } })) return null;
  const plan = await prisma.plan.findFirst({ where: { productKey, isTrial: true, isActive: true }, orderBy: { createdAt: "asc" } });
  if (!plan) return null;
  return assignPlan({ businessId, productKey, planId: plan.id, actorUserId: null, now });
}

/**
 * The scheduled sweep: a trial past its end and a paid period past its end are marked LOCKED (so lists and reports show it),
 * and a fresh snapshot goes out. The product already locks by the dates in its own snapshot; this keeps ops's record true.
 * `productKey` limits the sweep to one product (the cron accepts it, and tests use it so they never touch real data).
 */
export async function sweepExpired(now: Date = new Date(), productKey?: string): Promise<number> {
  const due = await prisma.subscription.findMany({
    where: { endDate: null, ...(productKey ? { productKey } : {}), OR: [{ status: "TRIALING", trialEndsAt: { lte: now } }, { status: "ACTIVE", currentPeriodEnd: { lte: now } }] },
    select: { id: true, businessId: true, productKey: true },
  });
  for (const sub of due) {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: "LOCKED" } });
    await audit({ actorUserId: null, action: "subscription.locked", subject: sub.businessId, detail: { productKey: sub.productKey, subscriptionId: sub.id } });
    try {
      await issueSnapshot(sub.businessId, sub.productKey, now);
    } catch (error) {
      console.error("[ops subscriptions] could not issue after lock", sub.businessId, error);
    }
  }
  return due.length;
}

export async function listSubscriptions(businessId: string) {
  return prisma.subscription.findMany({ where: { businessId }, include: { plan: { select: { name: true, code: true } }, product: { select: { name: true } } }, orderBy: { startDate: "desc" } });
}
