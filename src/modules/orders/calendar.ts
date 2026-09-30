import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus, EventStatus } from "@/generated/prisma/enums";

/**
 * Chunk 13 — the one place every calendar surface (Dashboard card, Create
 * Order's date picker, the /calendar page) gets its numbers from, so their
 * counts can never drift apart.
 *
 * Order/Event dates are stored as UTC midnight (`new Date("YYYY-MM-DD")`),
 * so day keys here are UTC "YYYY-MM-DD" strings — independent of the server's
 * own timezone.
 *
 * An Order counts on EVERY day of its [eventStartDate, eventEndDate] range,
 * not only its first: a 3-day wedding makes all 3 days busy. Cancelled
 * Orders/Events never count. From 2026-09-30 only confirmed Orders show at all:
 * Approved, Sent to Kitchen or Completed (see CALENDAR_ORDER_STATUSES).
 */

/** The only Order statuses the calendar surfaces — an order still in review or awaiting the customer is not a booking yet. */
const CALENDAR_ORDER_STATUSES: OrderStatus[] = ["APPROVED", "SENT_TO_KITCHEN", "COMPLETED"];

const DAY_MS = 86_400_000;
/** Hard ceiling so a corrupt/huge range can't spin the loop for years. */
const MAX_RANGE_DAYS = 400;

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIsoDay(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Every "YYYY-MM-DD" from `start` to `end` inclusive, clamped to [fromIso, toIso]. */
export function daysInRange(start: Date, end: Date, fromIso: string, toIso: string): string[] {
  const from = parseIsoDay(fromIso).getTime();
  const to = parseIsoDay(toIso).getTime();
  const first = Math.max(parseIsoDay(isoDay(start)).getTime(), from);
  const last = Math.min(parseIsoDay(isoDay(end)).getTime(), to);
  const days: string[] = [];
  for (let t = first, n = 0; t <= last && n < MAX_RANGE_DAYS; t += DAY_MS, n++) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/** Pure: how many of `ranges` cover each day (clamped to the window). */
export function countByDay(ranges: { start: Date; end: Date }[], fromIso: string, toIso: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of ranges) {
    for (const day of daysInRange(r.start, r.end, fromIso, toIso)) {
      counts[day] = (counts[day] ?? 0) + 1;
    }
  }
  return counts;
}

/** Orders overlapping [fromIso, toIso] (inclusive). */
function overlapsWindow(fromIso: string, toIso: string) {
  return { lte: parseIsoDay(toIso), gte: parseIsoDay(fromIso) };
}

/**
 * An Event follows its Order (AJ, 2026-09-30): one linked to an Order shows
 * only while that Order is confirmed (Approved, Sent to Kitchen, Completed),
 * so cancelling one, or sending it back to review, clears it from the
 * Calendar with no separate step. An Event with no Order (created
 * on its own) falls back to its own status.
 */
const liveEvent: Prisma.EventWhereInput = {
  status: { not: "CANCELLED" },
  OR: [{ orderId: null }, { order: { status: { in: CALENDAR_ORDER_STATUSES } } }],
};

/** "YYYY-MM-DD" -> number of confirmed Orders happening that day. */
export async function getOrderCountsByDay(organizationId: string, fromIso: string, toIso: string): Promise<Record<string, number>> {
  const w = overlapsWindow(fromIso, toIso);
  const orders = await prisma.order.findMany({
    where: { organizationId, status: { in: CALENDAR_ORDER_STATUSES }, eventStartDate: { lte: w.lte }, eventEndDate: { gte: w.gte } },
    select: { eventStartDate: true, eventEndDate: true },
  });
  return countByDay(
    orders.map((o) => ({ start: o.eventStartDate, end: o.eventEndDate })),
    fromIso,
    toIso,
  );
}

export interface CalendarOrder {
  id: string;
  orderNumber: string | null;
  customerName: string;
  eventTypeName: string | null;
  status: OrderStatus;
  startDate: string;
  endDate: string;
  guests: number | null;
  venue: string | null;
  hasEvent: boolean;
}

export interface CalendarEvent {
  id: string;
  name: string;
  customerName: string;
  status: EventStatus;
  startDate: string;
  endDate: string;
  guests: number | null;
  venue: string | null;
  orderId: string | null;
}

export interface InventoryConstraint {
  inventoryId: string;
  name: string;
  unit: string;
  required: number;
  inStock: number;
}

export interface CalendarData {
  orders: CalendarOrder[];
  events: CalendarEvent[];
  orderCountsByDay: Record<string, number>;
  eventCountsByDay: Record<string, number>;
  inventoryConstraints: InventoryConstraint[];
}

/**
 * Everything the /calendar page needs for one window: the Orders and Events
 * overlapping it, per-day counts for both, and inventory items whose total
 * required quantity across the window's live Events exceeds current stock.
 */
export async function getCalendarData(organizationId: string, fromIso: string, toIso: string): Promise<CalendarData> {
  const w = overlapsWindow(fromIso, toIso);
  const [orders, events, required] = await Promise.all([
    prisma.order.findMany({
      where: { organizationId, status: { in: CALENDAR_ORDER_STATUSES }, eventStartDate: { lte: w.lte }, eventEndDate: { gte: w.gte } },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        eventStartDate: true,
        eventEndDate: true,
        totalParticipants: true,
        venue: true,
        customer: { select: { name: true } },
        eventType: { select: { name: true } },
        events: { select: { id: true }, take: 1 },
      },
      orderBy: [{ eventStartDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.event.findMany({
      where: { organizationId, ...liveEvent, startDate: { lte: w.lte }, endDate: { gte: w.gte } },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        guestCount: true,
        venue: true,
        orderId: true,
        customer: { select: { name: true } },
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.eventRequiredInventory.findMany({
      // Still to be cooked: an Order that is Completed or Cancelled no longer needs its stock held back.
      where: {
        event: {
          organizationId,
          startDate: { lte: w.lte },
          endDate: { gte: w.gte },
          OR: [
            { orderId: null, status: { in: ["PENDING", "PROCESSING"] } },
            { order: { status: { in: ["APPROVED", "SENT_TO_KITCHEN"] } } },
          ],
        },
      },
      select: { quantity: true, inventory: { select: { id: true, name: true, unit: true, stockCount: true } } },
    }),
  ]);

  const totals = new Map<string, InventoryConstraint>();
  for (const row of required) {
    const existing = totals.get(row.inventory.id);
    const qty = Number(row.quantity);
    if (existing) existing.required += qty;
    else
      totals.set(row.inventory.id, {
        inventoryId: row.inventory.id,
        name: row.inventory.name,
        unit: row.inventory.unit,
        required: qty,
        inStock: Number(row.inventory.stockCount),
      });
  }

  return {
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer.name,
      eventTypeName: o.eventType?.name ?? null,
      status: o.status,
      startDate: isoDay(o.eventStartDate),
      endDate: isoDay(o.eventEndDate),
      guests: o.totalParticipants,
      venue: o.venue,
      hasEvent: o.events.length > 0,
    })),
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      customerName: e.customer.name,
      status: e.status,
      startDate: isoDay(e.startDate),
      endDate: isoDay(e.endDate),
      guests: e.guestCount,
      venue: e.venue,
      orderId: e.orderId,
    })),
    orderCountsByDay: countByDay(
      orders.map((o) => ({ start: o.eventStartDate, end: o.eventEndDate })),
      fromIso,
      toIso,
    ),
    eventCountsByDay: countByDay(
      events.map((e) => ({ start: e.startDate, end: e.endDate })),
      fromIso,
      toIso,
    ),
    inventoryConstraints: [...totals.values()].filter((i) => i.required > i.inStock).sort((a, b) => b.required - b.inStock - (a.required - a.inStock)),
  };
}
