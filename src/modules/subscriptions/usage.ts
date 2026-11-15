import "server-only";
import { prisma } from "@/lib/db";
import { limitOf, type EntitlementView } from "@/modules/ops-link/entitlements";

/**
 * What the plan allows and how much of it the kitchen has used, for the account drawer (AJ, 2026-11-15). The limits come from the plan's entitlements (null = unlimited);
 * the counts are everything recorded so far, the same counts the limit checks use (`assertWithinPlanLimit`, `getSeatUsage`).
 */
export type UsageRow = { key: "maxUsers" | "maxEvents" | "maxOrders" | "maxCustomers"; label: string; used: number; limit: number | null };

export async function getPlanUsage(organizationId: string, entitlements: EntitlementView): Promise<UsageRow[]> {
  const [members, events, orders, customers] = await Promise.all([
    prisma.member.count({ where: { organizationId, disabledAt: null } }),
    prisma.event.count({ where: { organizationId } }),
    prisma.order.count({ where: { organizationId } }),
    prisma.customer.count({ where: { organizationId } }),
  ]);
  const limit = (key: UsageRow["key"]) => limitOf(entitlements, key) ?? null;
  return [
    { key: "maxUsers", label: "Team members", used: members, limit: limit("maxUsers") },
    { key: "maxEvents", label: "Events", used: events, limit: limit("maxEvents") },
    { key: "maxOrders", label: "Orders", used: orders, limit: limit("maxOrders") },
    { key: "maxCustomers", label: "Customers", used: customers, limit: limit("maxCustomers") },
  ];
}
