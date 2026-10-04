import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { RULES, validateInput, checkPhone } from "@/lib/validation";
import type { DispatchStatus, SetupStatus } from "@/generated/prisma/enums";
import { onDispatchChanged } from "@/modules/notifications/triggers";
import { DISPATCH_STATUSES, SETUP_STATUSES } from "./labels";

export class LogisticsError extends Error {}

export interface LogisticsInput {
  vehicleType?: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  dispatchPlannedAt?: Date | null;
  dispatchStatus: DispatchStatus;
  setupStatus: SetupStatus;
  setupTime?: Date | null;
  setupNotes?: string;
}

const blank = (v?: string) => v?.trim() || null;

/**
 * Creates or replaces the event's logistics. Moving the dispatch status stamps the real times: "on the way" records when it
 * left, "delivered" when it arrived; moving back clears the later stamp, so the times always match the status.
 */
export async function saveLogistics(organizationId: string, eventId: string, input: LogisticsInput, actorUserId: string) {
  validateInput(input, RULES.eventLogistics);
  if (input.driverPhone?.trim()) checkPhone(input.driverPhone, "driver phone");
  if (!DISPATCH_STATUSES.includes(input.dispatchStatus)) throw new LogisticsError("Choose a dispatch status.");
  if (!SETUP_STATUSES.includes(input.setupStatus)) throw new LogisticsError("Choose a setup status.");
  for (const d of [input.dispatchPlannedAt, input.setupTime]) if (d && Number.isNaN(d.getTime())) throw new LogisticsError("Enter a valid date and time.");
  await prisma.event.findFirstOrThrow({ where: { id: eventId, organizationId }, select: { id: true } });

  const before = await prisma.eventLogistics.findUnique({ where: { eventId } });
  const now = new Date();
  const wasDispatched = before?.dispatchStatus === "DISPATCHED" || before?.dispatchStatus === "DELIVERED";
  const nowDispatched = input.dispatchStatus === "DISPATCHED" || input.dispatchStatus === "DELIVERED";
  const dispatchedAt = nowDispatched ? (wasDispatched ? (before?.dispatchedAt ?? now) : now) : null;
  const deliveredAt = input.dispatchStatus === "DELIVERED" ? (before?.dispatchStatus === "DELIVERED" ? (before.deliveredAt ?? now) : now) : null;

  const data = {
    vehicleType: blank(input.vehicleType),
    vehicleNumber: blank(input.vehicleNumber)?.toUpperCase() ?? null,
    driverName: blank(input.driverName),
    driverPhone: blank(input.driverPhone),
    dispatchPlannedAt: input.dispatchPlannedAt ?? null,
    dispatchStatus: input.dispatchStatus,
    dispatchedAt,
    deliveredAt,
    setupStatus: input.setupStatus,
    setupTime: input.setupTime ?? null,
    setupNotes: blank(input.setupNotes),
  };
  const saved = await prisma.eventLogistics.upsert({ where: { eventId }, create: { organizationId, eventId, ...data }, update: data });
  await audit({
    organizationId,
    actorUserId,
    action: before ? "event_logistics.update" : "event_logistics.create",
    recordType: "EventLogistics",
    recordId: saved.id,
    before: before ? { dispatchStatus: before.dispatchStatus, setupStatus: before.setupStatus } : undefined,
    after: { dispatchStatus: saved.dispatchStatus, setupStatus: saved.setupStatus },
  });
  // Tell the team only when the status actually moved to "on the way" or "delivered".
  if (saved.dispatchStatus !== (before?.dispatchStatus ?? "NOT_DISPATCHED") && (saved.dispatchStatus === "DISPATCHED" || saved.dispatchStatus === "DELIVERED")) {
    await onDispatchChanged(organizationId, eventId, saved.dispatchStatus, saved.driverName);
  }
  return saved;
}

export function getLogistics(organizationId: string, eventId: string) {
  return prisma.eventLogistics.findFirst({ where: { organizationId, eventId } });
}

/** The delivery address is the order's own venue details; this reads them for the logistics panel. */
export async function getDeliveryAddress(organizationId: string, orderId: string | null) {
  if (!orderId) return null;
  const o = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: { venue: true, eventAddress: true, venueDoorNumber: true, venueTower: true, venueFloor: true, venueHallName: true, venueLandmark: true, venueContactName: true, venueContactPhone: true, venueAccessInstructions: true, deliveryInstructions: true },
  });
  if (!o) return null;
  const place = [o.venueHallName, o.venueTower && `Tower ${o.venueTower}`, o.venueFloor && `Floor ${o.venueFloor}`, o.venueDoorNumber && `Door ${o.venueDoorNumber}`].filter(Boolean).join(", ");
  return {
    venue: o.venue,
    address: [o.eventAddress, place, o.venueLandmark && `Near ${o.venueLandmark}`].filter(Boolean).join(", ") || null,
    contact: [o.venueContactName, o.venueContactPhone].filter(Boolean).join(" · ") || null,
    instructions: [o.venueAccessInstructions, o.deliveryInstructions].filter(Boolean).join(" ") || null,
  };
}
