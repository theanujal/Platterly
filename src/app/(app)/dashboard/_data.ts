import { eventAt, orderAt } from "@/modules/locations/scope";
import { prisma } from "@/lib/db";
import { getTenantTimeZone } from "@/lib/settings/timezone";
import { todayStartInZone } from "@/lib/time/timezone";
import { addDaysIso, dayKeyInZone, daysInRange, DEFAULT_PRESET, presetRange, zonedStartOfDay, type DateRange } from "@/lib/time/date-range";
import { getInventoryOverviewStats, listLowStockItems } from "@/modules/inventory/inventory";
import { getGuestCount } from "@/modules/orders/order-card";
import { getOrderCountsByDay } from "@/modules/orders/calendar";
import type { MealType, OrderStatus } from "@/generated/prisma/enums";

/**
 * Local calendar-day key (YYYY-MM-DD) built from a Date's own local
 * year/month/day components — never `toISOString().slice(0, 10)`, which
 * round-trips through UTC and silently shifts the date backward in any
 * positive-UTC-offset timezone (the exact bug fixed in order-form.tsx's
 * `toLocalIsoDate`, documented in .claude/STATUS.md; this machine is IST).
 */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DAY_MS = 86_400_000;
/** Closed orders: neither of these is "active" any more. */
const CLOSED: OrderStatus[] = ["COMPLETED", "CANCELLED"];
const MEAL_ORDER: MealType[] = ["BREAKFAST", "LUNCH", "HITEA", "DINNER", "OTHER"];
const MEAL_LABEL: Record<MealType, string> = { BREAKFAST: "Breakfast", LUNCH: "Lunch", HITEA: "Hi-Tea", DINNER: "Dinner", OTHER: "Other" };

export interface DashboardOrderRow {
  id: string;
  orderNumber: string | null;
  customerName: string;
  eventTypeName: string | null;
  eventStartDate: Date;
  eventEndDate: Date;
  guests: number | null;
  total: number;
  advance: number;
  status: OrderStatus;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
}

const ORDER_ROW_SELECT = {
  id: true,
  orderNumber: true,
  eventStartDate: true,
  eventEndDate: true,
  total: true,
  advance: true,
  status: true,
  paymentStatus: true,
  totalParticipants: true,
  adultCount: true,
  childBelow5Count: true,
  child5To10Count: true,
  customer: { select: { name: true } },
  eventType: { select: { name: true } },
} as const;

type OrderRowSource = {
  id: string;
  orderNumber: string | null;
  eventStartDate: Date;
  eventEndDate: Date;
  total: unknown;
  advance: unknown;
  status: OrderStatus;
  paymentStatus: DashboardOrderRow["paymentStatus"];
  totalParticipants: number | null;
  adultCount: number | null;
  childBelow5Count: number | null;
  child5To10Count: number | null;
  customer: { name: string };
  eventType: { name: string } | null;
};

function toRow(order: OrderRowSource): DashboardOrderRow {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customer.name,
    eventTypeName: order.eventType?.name ?? null,
    eventStartDate: order.eventStartDate,
    eventEndDate: order.eventEndDate,
    guests: getGuestCount(order),
    total: Number(order.total),
    advance: Number(order.advance),
    status: order.status,
    paymentStatus: order.paymentStatus,
  };
}

/**
 * Single aggregation point for the Dashboard — one Promise.all round trip
 * instead of each card running its own query. Order and event dates are
 * stored as UTC midnight of the local calendar day (see orders/calendar.ts),
 * so "today" below is that same UTC-midnight value.
 *
 * `range` (AJ, 2026-10-14) is the date range picked on the Dashboard, both days included, in the kitchen's time zone:
 * Total Guests and Event Insights follow it by event date; Order Activity, Pending Revenue and Quotations by the day
 * the order or quotation was created. Active Orders, Upcoming Events (next 7 days), the calendar, today's lists, the
 * kitchen workload and inventory are current-state and do not follow it.
 */
export async function getDashboardSnapshot(organizationId: string, locationId?: string | null, requestedRange?: DateRange) {
  // Chunk 23: with a location chosen (or held), every figure below is that location's. Quotations have no location, so they drop out.
  const atOrder = orderAt(locationId);
  const now = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const timeZone = await getTenantTimeZone(organizationId);
  const todayUtc = todayStartInZone(now, timeZone);
  const todayIso = dayKeyInZone(now, timeZone);
  const range = requestedRange ?? presetRange(DEFAULT_PRESET, todayIso);
  const tomorrowUtc = new Date(todayUtc.getTime() + DAY_MS);
  const in7DaysUtc = new Date(todayUtc.getTime() + 7 * DAY_MS);
  // The picked range as the two kinds of boundary the data needs: UTC-midnight event dates, and real instants (the kitchen's
  // local midnight) for `createdAt`. The end day is included, so the upper bounds are the start of the day after it.
  const eventFrom = new Date(`${range.from}T00:00:00.000Z`);
  const eventToExcl = new Date(`${addDaysIso(range.to, 1)}T00:00:00.000Z`);
  const createdFrom = zonedStartOfDay(range.from, timeZone);
  const createdToExcl = zonedStartOfDay(addDaysIso(range.to, 1), timeZone);
  const createdInRange = { gte: createdFrom, lt: createdToExcl };
  const eventInRange = { gte: eventFrom, lt: eventToExcl };
  // Calendar window: 1 month back to 3 months forward (+/- a week for the faded adjacent-month days), so the Orders
  // Calendar's month navigation stays in the browser with no extra request.
  const calendarStart = new Date(startOfToday.getFullYear(), startOfToday.getMonth() - 1, -6);
  const calendarEnd = new Date(startOfToday.getFullYear(), startOfToday.getMonth() + 4, 8);
  const activeWhere = { organizationId, ...atOrder, status: { notIn: CLOSED } };
  const notCancelled = { organizationId, ...atOrder, status: { not: "CANCELLED" as const } };

  const [
    activeOrders,
    pendingReviewOrders,
    awaitingApprovalOrders,
    upcomingEventsCount,
    rangeGuestOrders,
    openQuotations,
    quotationsAwaitingResponse,
    dueAgg,
    overdueAgg,
    overdueTop,
    trendOrdersRaw,
    eventTypeGroups,
    todayOrders,
    todayCount,
    upcomingOrders,
    upcomingCount,
    allOrders,
    allCount,
    mealEntries,
    inventory,
    lowStockItems,
    orderCountsByDay,
  ] = await Promise.all([
    prisma.order.count({ where: activeWhere }),
    prisma.order.count({ where: { organizationId, ...atOrder, status: "PENDING_REVIEW" } }),
    prisma.order.count({ where: { organizationId, ...atOrder, status: "AWAITING_CUSTOMER_APPROVAL" } }),
    prisma.event.count({ where: { organizationId, ...eventAt(locationId), status: { not: "CANCELLED" }, startDate: { gte: todayUtc, lt: in7DaysUtc } } }),
    prisma.order.findMany({
      where: { ...notCancelled, eventStartDate: eventInRange },
      select: { totalParticipants: true, adultCount: true, childBelow5Count: true, child5To10Count: true },
    }),
    locationId ? Promise.resolve(0) : prisma.quotation.count({ where: { organizationId, createdAt: createdInRange, status: { in: ["DRAFT", "SENT", "VIEWED", "CHANGES_REQUESTED"] } } }),
    locationId ? Promise.resolve(0) : prisma.quotation.count({ where: { organizationId, createdAt: createdInRange, status: { in: ["SENT", "VIEWED"] } } }),
    prisma.order.aggregate({ where: { ...notCancelled, balance: { gt: 0 }, createdAt: createdInRange }, _sum: { balance: true }, _count: { _all: true } }),
    prisma.order.aggregate({ where: { ...notCancelled, balance: { gt: 0 }, eventStartDate: { lt: todayUtc } }, _sum: { balance: true }, _count: { _all: true } }),
    prisma.order.findFirst({
      where: { ...notCancelled, balance: { gt: 0 }, eventStartDate: { lt: todayUtc } },
      orderBy: { eventStartDate: "asc" },
      select: { balance: true, orderNumber: true, customer: { select: { name: true } } },
    }),
    prisma.order.findMany({
      where: { ...notCancelled, createdAt: createdInRange },
      select: { createdAt: true, total: true, totalParticipants: true, adultCount: true, childBelow5Count: true, child5To10Count: true },
    }),
    prisma.event.groupBy({ by: ["eventTypeId"], where: { organizationId, ...eventAt(locationId), status: { not: "CANCELLED" }, startDate: eventInRange }, _count: { _all: true } }),
    prisma.order.findMany({ where: { ...notCancelled, eventStartDate: { gte: todayUtc, lt: tomorrowUtc } }, orderBy: { createdAt: "desc" }, take: 7, select: ORDER_ROW_SELECT }),
    prisma.order.count({ where: { ...notCancelled, eventStartDate: { gte: todayUtc, lt: tomorrowUtc } } }),
    prisma.order.findMany({ where: { ...notCancelled, eventStartDate: { gte: tomorrowUtc } }, orderBy: { eventStartDate: "asc" }, take: 7, select: ORDER_ROW_SELECT }),
    prisma.order.count({ where: { ...notCancelled, eventStartDate: { gte: tomorrowUtc } } }),
    prisma.order.findMany({ where: { organizationId, ...atOrder }, orderBy: { createdAt: "desc" }, take: 7, select: ORDER_ROW_SELECT }),
    prisma.order.count({ where: { organizationId, ...atOrder } }),
    prisma.mealPlanEntry.findMany({
      where: { date: { gte: todayUtc, lt: tomorrowUtc }, order: { ...notCancelled } },
      select: { mealType: true, order: { select: { totalParticipants: true, adultCount: true, childBelow5Count: true, child5To10Count: true } } },
    }),
    getInventoryOverviewStats(organizationId, locationId),
    listLowStockItems(organizationId, locationId),
    getOrderCountsByDay(organizationId, dateKey(calendarStart), dateKey(calendarEnd), locationId),
  ]);

  // Order activity: one row per day (oldest first) of orders created in the range, their value and their guests. The chart
  // stops at today: orders cannot be created in the future, so the rest of an upcoming month would only be a flat line.
  const byDay = new Map<string, { orders: number; revenue: number; guests: number }>();
  for (const order of trendOrdersRaw) {
    const key = dayKeyInZone(order.createdAt, timeZone);
    const row = byDay.get(key) ?? { orders: 0, revenue: 0, guests: 0 };
    row.orders += 1;
    row.revenue += Number(order.total);
    row.guests += getGuestCount(order) ?? 0;
    byDay.set(key, row);
  }
  const chartEnd = range.to < todayIso ? range.to : todayIso;
  const chartDays = chartEnd < range.from ? 0 : daysInRange({ from: range.from, to: chartEnd });
  const activity: { date: string; orders: number; revenue: number; guests: number }[] = [];
  for (let i = 0; i < chartDays; i++) {
    const key = addDaysIso(range.from, i);
    activity.push({ date: key, ...(byDay.get(key) ?? { orders: 0, revenue: 0, guests: 0 }) });
  }

  // Event types: the four biggest, the rest folded into "Other".
  const typeIds = eventTypeGroups.map((g) => g.eventTypeId);
  const typeNames = new Map((await prisma.eventType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
  const typeRows = eventTypeGroups.map((g) => ({ name: typeNames.get(g.eventTypeId) ?? "Other", count: g._count._all })).sort((a, b) => b.count - a.count);
  const eventTypeDistribution = [
    ...typeRows.slice(0, 4),
    ...(typeRows.length > 4 ? [{ name: "Other", count: typeRows.slice(4).reduce((sum, r) => sum + r.count, 0) }] : []),
  ];

  // Kitchen workload today: guests per meal across every order with that meal today.
  const mealGuests = new Map<MealType, number>();
  for (const entry of mealEntries) mealGuests.set(entry.mealType, (mealGuests.get(entry.mealType) ?? 0) + (getGuestCount(entry.order) ?? 0));
  const kitchenWorkload = MEAL_ORDER.filter((meal) => (mealGuests.get(meal) ?? 0) > 0).map((meal) => ({ meal: MEAL_LABEL[meal], guests: mealGuests.get(meal) ?? 0 }));

  return {
    activeOrders,
    pendingReviewOrders,
    awaitingApprovalOrders,
    upcomingEventsCount,
    rangeGuests: rangeGuestOrders.reduce((sum, o) => sum + (getGuestCount(o) ?? 0), 0),
    openQuotations,
    quotationsAwaitingResponse,
    outstandingBalance: Number(dueAgg._sum.balance ?? 0),
    outstandingOrdersCount: dueAgg._count._all,
    overdue: {
      count: overdueAgg._count._all,
      amount: Number(overdueAgg._sum.balance ?? 0),
      top: overdueTop ? { customerName: overdueTop.customer.name, orderNumber: overdueTop.orderNumber, balance: Number(overdueTop.balance) } : null,
    },
    activity,
    eventTypeDistribution,
    eventTotal: typeRows.reduce((sum, r) => sum + r.count, 0),
    orderTabs: {
      today: { count: todayCount, rows: todayOrders.map(toRow) },
      upcoming: { count: upcomingCount, rows: upcomingOrders.map(toRow) },
      all: { count: allCount, rows: allOrders.map(toRow) },
    },
    orderCountsByDay,
    kitchenWorkload,
    kitchenGuestsToday: kitchenWorkload.reduce((sum, m) => sum + m.guests, 0),
    inventory: {
      lowStock: inventory.lowStock,
      expired: inventory.expired,
      expiringSoon: inventory.expiringSoon,
      keyItems: lowStockItems.slice(0, 3).map((item) => ({ id: item.id, name: item.name, stock: Number(item.stockCount), unit: item.unit })),
    },
  };
}

export type DashboardSnapshot = Awaited<ReturnType<typeof getDashboardSnapshot>>;

/**
 * The snapshot for a person who may not see every kind of money (Roles & Permissions redesign, AJ 2026-10-17): the figures they may
 * not see are replaced by 0 here, on the server, before the page hands anything to a client component, so the browser never receives
 * them. `orderPrices` covers revenue and order totals; `paymentDetails` covers what is owed, overdue and paid.
 */
export function redactDashboardSnapshot(snapshot: DashboardSnapshot, allowed: { orderPrices: boolean; paymentDetails: boolean }): DashboardSnapshot {
  if (allowed.orderPrices && allowed.paymentDetails) return snapshot;
  const row = (r: DashboardOrderRow): DashboardOrderRow => ({
    ...r,
    total: allowed.orderPrices ? r.total : 0,
    advance: allowed.paymentDetails ? r.advance : 0,
    paymentStatus: allowed.paymentDetails ? r.paymentStatus : "UNPAID",
  });
  const tab = (t: DashboardSnapshot["orderTabs"]["today"]) => ({ ...t, rows: t.rows.map(row) });
  return {
    ...snapshot,
    outstandingBalance: allowed.paymentDetails ? snapshot.outstandingBalance : 0,
    outstandingOrdersCount: allowed.paymentDetails ? snapshot.outstandingOrdersCount : 0,
    overdue: allowed.paymentDetails ? snapshot.overdue : { count: 0, amount: 0, top: null },
    activity: snapshot.activity.map((day) => ({ ...day, revenue: allowed.orderPrices ? day.revenue : 0 })),
    orderTabs: { today: tab(snapshot.orderTabs.today), upcoming: tab(snapshot.orderTabs.upcoming), all: tab(snapshot.orderTabs.all) },
  };
}
