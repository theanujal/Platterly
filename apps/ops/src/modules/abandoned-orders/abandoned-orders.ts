import "server-only";
import { prisma } from "@/lib/db";

/** How long a record is kept (AJ, 2026-11-14): 90 days after the sign-up was abandoned, then it goes. */
export const RETENTION_DAYS = 90;

/** Open and followed-up abandoned paid-plan sign-ups, newest first. Records past the retention period are removed first. */
export async function listAbandonedOrders(now: Date = new Date()) {
  await prisma.abandonedOrder.deleteMany({ where: { abandonedAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 86_400_000) } } });
  return prisma.abandonedOrder.findMany({ orderBy: { abandonedAt: "desc" }, take: 500 });
}

/** Staff have followed up (or are done with it). */
export async function markAbandonedOrderFollowedUp(id: string): Promise<void> {
  await prisma.abandonedOrder.updateMany({ where: { id }, data: { status: "FOLLOWED_UP" } });
}
