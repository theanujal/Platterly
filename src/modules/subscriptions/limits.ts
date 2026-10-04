import "server-only";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { getCurrentSubscription } from "./subscription";

/**
 * Chunk 20 Verify: the plan's limits actually stop usage. A null limit on the plan is unlimited, so the trial plan
 * (which carries no limits). Team seats are checked where invitations are sent (`getSeatUsage`) and any plan without a number never block anything.
 */
export type LimitKey = "maxCustomers" | "maxOrders" | "maxEvents";

const NOUN: Record<LimitKey, string> = { maxCustomers: "customers", maxOrders: "orders", maxEvents: "events" };

async function used(organizationId: string, key: LimitKey): Promise<number> {
  switch (key) {
    case "maxCustomers":
      return prisma.customer.count({ where: { organizationId } });
    case "maxOrders":
      return prisma.order.count({ where: { organizationId } });
    case "maxEvents":
      return prisma.event.count({ where: { organizationId } });
  }
}

export class PlanLimitError extends ValidationError {
  constructor(key: LimitKey, limit: number, planName: string) {
    super(`Your ${planName} plan allows ${limit.toLocaleString("en-IN")} ${NOUN[key]}. Upgrade your plan to add more.`);
    this.name = "PlanLimitError";
  }
}

/** Chunk 23: whether the kitchen's current plan includes multiple locations. No subscription means no. */
export async function hasMultiLocationPlan(organizationId: string): Promise<boolean> {
  const subscription = await getCurrentSubscription(organizationId);
  return subscription?.subscriptionPlan.multiLocation === true;
}

export async function assertMultiLocationPlan(organizationId: string): Promise<void> {
  if (!(await hasMultiLocationPlan(organizationId))) throw new ValidationError("Your plan does not include multiple locations. Upgrade your plan to use them.");
}

/** Throws a plain-language error when adding one more would pass the plan's limit. */
export async function assertWithinPlanLimit(organizationId: string, key: LimitKey): Promise<void> {
  const subscription = await getCurrentSubscription(organizationId);
  const limit = subscription?.subscriptionPlan[key] ?? null;
  if (limit === null || limit === undefined) return;
  if ((await used(organizationId, key)) >= limit) throw new PlanLimitError(key, limit, subscription!.subscriptionPlan.name);
}
