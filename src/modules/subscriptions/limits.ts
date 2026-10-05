import "server-only";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { flagOf, getEntitlements, limitOf } from "@/modules/ops-link/entitlements";

/**
 * Chunk 20 Verify: the plan's limits actually stop usage. A null limit is unlimited, so the trial plan
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
  return flagOf(await getEntitlements(organizationId), "multiLocation");
}

export async function assertMultiLocationPlan(organizationId: string): Promise<void> {
  if (!(await hasMultiLocationPlan(organizationId))) throw new ValidationError("Your plan does not include multiple locations. Upgrade your plan to use them.");
}

/** Throws a plain-language error when adding one more would pass the plan's limit. */
export async function assertWithinPlanLimit(organizationId: string, key: LimitKey): Promise<void> {
  const entitlements = await getEntitlements(organizationId);
  const limit = limitOf(entitlements, key) ?? null;
  if (limit === null) return;
  if ((await used(organizationId, key)) >= limit) throw new PlanLimitError(key, limit, entitlements.planName ?? "current");
}
