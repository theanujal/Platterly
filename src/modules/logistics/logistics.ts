import { assertEventOrderNotCompleted } from "@/modules/orders/order-guard";
import "server-only";
import { prisma } from "@/lib/db";
import { MEAL_TYPE_LABEL } from "@/modules/menu-approvals/approval-snapshot";
import { audit } from "@/lib/audit/audit";
import { RULES, validateInput, checkPhone } from "@/lib/validation";
import type { DispatchStatus, SetupStatus } from "@/generated/prisma/enums";
import { onDispatchChanged } from "@/modules/notifications/triggers";
import { buildEventSlots } from "@/modules/orders/event-slots";
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

export const LOGISTICS_NOT_OPEN_MESSAGE = "Logistics can be filled in once the order is sent to the kitchen.";

/**
 * The order's events (meal slots) when logistics is kept per event: only when the venue differs by event (Order Details) and there are two or more.
 * Otherwise the event has one logistics record, whatever the number of meals.
 */
export async function getLogisticsSlots(organizationId: string, eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId },
    select: { order: { select: { status: true, venuePerEvent: true, mealPlanEntries: { select: { date: true, mealType: true } } } } },
  });
  const order = event?.order ?? null;
  const slots = order ? buildEventSlots(order.mealPlanEntries.map((meal) => ({ date: meal.date.toISOString().slice(0, 10), mealType: meal.mealType }))) : [];
  return { orderStatus: order?.status ?? null, slots: order?.venuePerEvent && slots.length >= 2 ? slots : [] };
}

/**
 * Creates or replaces the logistics of an event, or (`slotKey`) of one of its events when the order has two or more. Moving the dispatch status stamps the real times: "on the way" records when it
 * left, "delivered" when it arrived; moving back clears the later stamp, so the times always match the status.
 */
export async function saveLogistics(organizationId: string, eventId: string, input: LogisticsInput, actorUserId: string, slotKey = "") {
  await assertEventOrderNotCompleted(organizationId, eventId);
  validateInput(input, RULES.eventLogistics);
  if (input.driverPhone?.trim()) checkPhone(input.driverPhone, "driver phone");
  if (!DISPATCH_STATUSES.includes(input.dispatchStatus)) throw new LogisticsError("Choose a dispatch status.");
  if (!SETUP_STATUSES.includes(input.setupStatus)) throw new LogisticsError("Choose a setup status.");
  for (const d of [input.dispatchPlannedAt, input.setupTime]) if (d && Number.isNaN(d.getTime())) throw new LogisticsError("Enter a valid date and time.");
  await prisma.event.findFirstOrThrow({ where: { id: eventId, organizationId }, select: { id: true } });
  // Logistics opens once the order is with the kitchen (AJ, 2026-10-18). An event with no order (older data) is not held to it.
  const { orderStatus, slots } = await getLogisticsSlots(organizationId, eventId);
  if (orderStatus !== null && orderStatus !== "SENT_TO_KITCHEN") throw new LogisticsError(LOGISTICS_NOT_OPEN_MESSAGE);
  // A venue that differs by event: each event is tracked on its own, under its own key; otherwise there is one record for the event.
  const slot = slots.find((candidate) => candidate.key === slotKey);
  if (slots.length >= 2 ? !slot : slotKey !== "") throw new LogisticsError(slots.length >= 2 ? "Choose which event this is for." : "This order has a single event.");

  const before = await prisma.eventLogistics.findUnique({ where: { eventId_slotKey: { eventId, slotKey } } });
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
  const saved = await prisma.eventLogistics.upsert({ where: { eventId_slotKey: { eventId, slotKey } }, create: { organizationId, eventId, slotKey, ...data }, update: data });
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
    await onDispatchChanged(organizationId, eventId, saved.dispatchStatus, saved.driverName, slot?.title);
  }
  return saved;
}

/** The event's own record (an order with a single event). */
export function getLogistics(organizationId: string, eventId: string) {
  return prisma.eventLogistics.findFirst({ where: { organizationId, eventId, slotKey: "" } });
}

/** Every logistics record of the event: the event's own, and one per event when the order has two or more. */
export function listLogistics(organizationId: string, eventId: string) {
  return prisma.eventLogistics.findMany({ where: { organizationId, eventId }, orderBy: { slotKey: "asc" } });
}

type VenueRow = { venue: string | null; eventAddress: string | null; venueDoorNumber: string | null; venueTower: string | null; venueFloor: string | null; venueHallName?: string | null; venueLandmark: string | null; venueContactName: string | null; venueContactPhone: string | null; venueAccessInstructions: string | null; deliveryInstructions?: string | null };

function formatVenue(o: VenueRow) {
  const place = [o.venueHallName, o.venueTower && `Tower ${o.venueTower}`, o.venueFloor && `Floor ${o.venueFloor}`, o.venueDoorNumber && `Door ${o.venueDoorNumber}`].filter(Boolean).join(", ");
  return {
    venue: o.venue,
    address: [o.eventAddress, place, o.venueLandmark && `Near ${o.venueLandmark}`].filter(Boolean).join(", ") || null,
    contact: [o.venueContactName, o.venueContactPhone].filter(Boolean).join(" · ") || null,
    instructions: [o.venueAccessInstructions, o.deliveryInstructions].filter(Boolean).join(" ") || null,
  };
}

/**
 * The delivery address is the order's own venue details; this reads them for the logistics panel. When the customer said the
 * venue differs by event day, `days` lists each day's venue too (the top-level fields are then the first day's).
 */
export async function getDeliveryAddress(organizationId: string, orderId: string | null) {
  if (!orderId) return null;
  const o = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: {
      venue: true, eventAddress: true, venueDoorNumber: true, venueTower: true, venueFloor: true, venueHallName: true, venueLandmark: true, venueContactName: true, venueContactPhone: true, venueAccessInstructions: true, deliveryInstructions: true,
      venuePerEvent: true,
      eventVenues: { orderBy: [{ date: "asc" }, { mealType: "asc" }] },
    },
  });
  if (!o) return null;
  return {
    ...formatVenue(o),
    days: o.venuePerEvent ? o.eventVenues.map((row) => ({ key: `${row.date.toISOString().slice(0, 10)}-${row.mealType}`, date: row.date.toISOString().slice(0, 10), meal: MEAL_TYPE_LABEL[row.mealType], ...formatVenue(row) })) : [],
  };
}
