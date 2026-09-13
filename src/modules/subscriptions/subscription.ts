import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";

/**
 * Chunk 3 Group 3.3 — manual tenant plan assignment (no live billing yet,
 * Chunk 20). Ends the tenant's current subscription (if any) and starts a
 * new one in the same transaction, so a tenant never has two "current"
 * (endDate: null) rows at once.
 */
export async function assignPlan(organizationId: string, subscriptionPlanId: string, actorUserId: string) {
  const plan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { id: subscriptionPlanId } });
  const now = new Date();

  const subscription = await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { organizationId, endDate: null },
      data: { status: "CANCELLED", endDate: now },
    });

    return tx.subscription.create({
      data: {
        organizationId,
        subscriptionPlanId,
        status: plan.isTrial ? "TRIALING" : "ACTIVE",
        startDate: now,
        trialEndsAt:
          plan.isTrial && plan.trialDurationDays
            ? new Date(now.getTime() + plan.trialDurationDays * 24 * 60 * 60 * 1000)
            : null,
      },
    });
  });

  await audit({
    organizationId,
    actorUserId,
    action: "subscription.assign_plan",
    recordType: "Subscription",
    recordId: subscription.id,
    after: { subscriptionPlanId, status: subscription.status },
  });

  return subscription;
}

export async function getCurrentSubscription(organizationId: string) {
  return prisma.subscription.findFirst({
    where: { organizationId, endDate: null },
    include: { subscriptionPlan: true },
    orderBy: { startDate: "desc" },
  });
}

export async function listSubscriptionHistory(organizationId: string) {
  return prisma.subscription.findMany({
    where: { organizationId },
    include: { subscriptionPlan: true },
    orderBy: { startDate: "desc" },
  });
}
