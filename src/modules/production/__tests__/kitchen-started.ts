import { prisma } from "@/lib/db";
import { ensureOrderMenuSelection } from "@/modules/menu-approvals/approval-link";

/**
 * Test fixture: the kitchen has moved the order's menu from Pending to In Preparation (AJ, 2026-10-19), which is what lets stock be
 * sent to the order. Gives the order an event and a Final/Locked menu approval when it has none yet.
 */
export async function startKitchen(organizationId: string, orderId: string, stage: "IN_PREPARATION" | "READY" | "DELIVERED" | "PENDING" = "IN_PREPARATION") {
  const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, organizationId }, include: { events: { select: { id: true } } } });
  if (order.events.length === 0) {
    const type = order.eventTypeId ? { id: order.eventTypeId } : await prisma.eventType.create({ data: { organizationId, name: `Fixture ${crypto.randomUUID().slice(0, 6)}` } });
    if (!order.eventTypeId) await prisma.order.update({ where: { id: orderId }, data: { eventTypeId: type.id } });
    await prisma.event.create({ data: { organizationId, customerId: order.customerId, eventTypeId: type.id, name: "Fixture event", startDate: order.eventStartDate, endDate: order.eventEndDate, orderId } });
  }
  const selection = (await ensureOrderMenuSelection(organizationId, orderId))!;
  await prisma.menuSelection.update({ where: { id: selection.id }, data: { status: "FINAL_LOCKED", kitchenProductionStatus: stage, lockedAt: new Date() } });
  return selection;
}
