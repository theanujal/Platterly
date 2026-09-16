import { prisma } from "@/lib/db";
import { getInventoryOverviewStats } from "@/modules/inventory/inventory";
import type { OrderStatus } from "@/generated/prisma/enums";

const ORDER_STATUSES: OrderStatus[] = ["DRAFT", "CONFIRMED", "IN_PREPARATION", "READY", "COMPLETED", "CANCELLED"];

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

/**
 * Single aggregation point for the Dashboard's layout — one Promise.all
 * round trip instead of each card component running its own query, since
 * several modules (KPI grid, Orders card, Needs Attention, Calendar) all
 * derive from the same Order rows. Inventory keeps its own existing helper
 * (getInventoryOverviewStats) since InventoryOverviewCard is unchanged.
 */
export async function getDashboardSnapshot(organizationId: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  // 1 year back covers the Orders card's revenue trend's longest range
  // (1Y) — the 1M/3M/6M range-toggle buttons just slice the tail of this
  // same dense array client-side, no extra round trip per range.
  const REVENUE_TREND_DAYS = 365;
  const revenueTrendStart = new Date(startOfToday.getTime() - (REVENUE_TREND_DAYS - 1) * 86400000);
  // Calendar window: 1 month back to 3 months forward — enough range for
  // the Orders Calendar's in-browser month navigation without refetching.
  const calendarStart = new Date(startOfToday.getFullYear(), startOfToday.getMonth() - 1, 1);
  const calendarEnd = new Date(startOfToday.getFullYear(), startOfToday.getMonth() + 4, 1);

  const [
    statusCounts,
    dueAgg,
    recentOrdersRaw,
    upcomingEventsRaw,
    quotationsAwaitingResponse,
    inventory,
    revenueOrdersRaw,
    calendarOrdersRaw,
  ] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true }, _sum: { total: true } }),
    prisma.order.aggregate({
      where: { organizationId, status: { not: "CANCELLED" }, balance: { gt: 0 } },
      _sum: { balance: true },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        total: true,
        eventStartDate: true,
        eventEndDate: true,
        customer: { select: { name: true } },
      },
    }),
    prisma.event.findMany({
      where: { organizationId, startDate: { gte: startOfToday }, status: { not: "CANCELLED" } },
      orderBy: { startDate: "asc" },
      take: 5,
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        venue: true,
        orderId: true,
        customer: { select: { name: true } },
        eventType: { select: { name: true } },
      },
    }),
    prisma.quotation.count({ where: { organizationId, status: { in: ["SENT", "VIEWED"] } } }),
    getInventoryOverviewStats(organizationId),
    prisma.order.findMany({
      where: { organizationId, createdAt: { gte: revenueTrendStart }, status: { not: "CANCELLED" } },
      select: { createdAt: true, total: true, status: true },
    }),
    prisma.order.findMany({
      where: { organizationId, eventStartDate: { gte: calendarStart, lt: calendarEnd }, status: { not: "CANCELLED" } },
      select: { eventStartDate: true },
    }),
  ]);

  const countFor = (status: OrderStatus) => statusCounts.find((s) => s.status === status)?._count._all ?? 0;
  const totalOrders = statusCounts.reduce((sum, s) => sum + s._count._all, 0);
  const draftOrders = countFor("DRAFT");

  const statusBreakdown = ORDER_STATUSES.map((status) => {
    const row = statusCounts.find((s) => s.status === status);
    return { status, count: row?._count._all ?? 0, totalValue: Number(row?._sum.total ?? 0) };
  });

  // Revenue trend: sum of Order.total per day (split Completed vs. still-
  // Pending, i.e. everything short of Completed/Cancelled), created in the
  // last year, filled dense so every day plots (0 where nothing was booked
  // that day). Cancelled orders are excluded entirely, same as the
  // outstanding-balance aggregate above.
  const totalByDay = new Map<string, number>();
  const completedByDay = new Map<string, number>();
  const pendingByDay = new Map<string, number>();
  for (const order of revenueOrdersRaw) {
    const key = dateKey(order.createdAt);
    const value = Number(order.total);
    totalByDay.set(key, (totalByDay.get(key) ?? 0) + value);
    if (order.status === "COMPLETED") {
      completedByDay.set(key, (completedByDay.get(key) ?? 0) + value);
    } else {
      pendingByDay.set(key, (pendingByDay.get(key) ?? 0) + value);
    }
  }
  const revenueTrend: { date: string; totalValue: number; completedValue: number; pendingValue: number }[] = [];
  for (let i = 0; i < REVENUE_TREND_DAYS; i++) {
    const d = new Date(revenueTrendStart.getTime() + i * 86400000);
    const key = dateKey(d);
    revenueTrend.push({
      date: key,
      totalValue: totalByDay.get(key) ?? 0,
      completedValue: completedByDay.get(key) ?? 0,
      pendingValue: pendingByDay.get(key) ?? 0,
    });
  }

  const orderCountsByDay: Record<string, number> = {};
  for (const order of calendarOrdersRaw) {
    const key = dateKey(order.eventStartDate);
    orderCountsByDay[key] = (orderCountsByDay[key] ?? 0) + 1;
  }

  return {
    totalOrders,
    statusBreakdown,
    draftOrders,
    outstandingBalance: Number(dueAgg._sum.balance ?? 0),
    outstandingOrdersCount: dueAgg._count._all,
    recentOrders: recentOrdersRaw.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: Number(o.total),
      eventStartDate: o.eventStartDate,
      eventEndDate: o.eventEndDate,
      customerName: o.customer.name,
    })),
    upcomingEvents: upcomingEventsRaw.map((e) => ({
      id: e.id,
      name: e.name,
      startDate: e.startDate,
      endDate: e.endDate,
      venue: e.venue,
      customerName: e.customer.name,
      eventTypeName: e.eventType.name,
      orderId: e.orderId,
    })),
    quotationsAwaitingResponse,
    inventory,
    revenueTrend,
    orderCountsByDay,
  };
}
