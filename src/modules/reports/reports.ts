import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { computeEvents, computeKitchens, computeSales, monthKey, monthLabel, type ReportOrder, type ReportOrderStatus } from "./report-math";

/**
 * Chunk 17.1 — loads the rows the Sales and Events reports are built from. One kitchen (`{ organizationId }`) or the
 * whole platform (`{ all: true }`, Super Admin only; the caller must have checked that). The figures themselves come
 * from `report-math.ts`.
 */
export type ReportScope = { organizationId: string } | { all: true };
export interface ReportRange {
  from: Date | null;
  to: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const scopeWhere = (scope: ReportScope) => ("organizationId" in scope ? { organizationId: scope.organizationId } : {});

/** `from` and `to` are calendar dates (both included), in India time for "when it was created". */
function dateFilter(range: ReportRange, tz: "ist" | "utc"): { gte?: Date; lt?: Date } | undefined {
  if (!range.from && !range.to) return undefined;
  const shift = tz === "ist" ? 5.5 * 60 * 60 * 1000 : 0;
  return {
    ...(range.from ? { gte: new Date(range.from.getTime() - shift) } : {}),
    ...(range.to ? { lt: new Date(range.to.getTime() + DAY_MS - shift) } : {}),
  };
}

const orderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  total: true,
  createdAt: true,
  eventStartDate: true,
  totalParticipants: true,
  organizationId: true,
  organization: { select: { name: true } },
  eventType: { select: { name: true } },
  customer: { select: { name: true } },
} satisfies Prisma.OrderSelect;

type OrderRowFromDb = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

const toReportOrder = (o: OrderRowFromDb): ReportOrder => ({
  id: o.id,
  orderNumber: o.orderNumber,
  customerName: o.customer.name,
  status: o.status as ReportOrderStatus,
  total: Number(o.total),
  createdAt: o.createdAt,
  eventStartDate: o.eventStartDate,
  guests: o.totalParticipants,
  eventType: o.eventType?.name ?? null,
  kitchenId: o.organizationId,
  kitchenName: o.organization.name,
});

export async function loadSalesReport(scope: ReportScope, range: ReportRange) {
  const created = dateFilter(range, "ist");
  const [orders, customers, quotations] = await Promise.all([
    prisma.order.findMany({ where: { ...scopeWhere(scope), ...(created ? { createdAt: created } : {}) }, select: orderSelect }),
    prisma.customer.findMany({ where: { ...scopeWhere(scope), ...(created ? { createdAt: created } : {}) }, select: { createdAt: true, orders: { select: { id: true }, take: 1 } } }),
    prisma.quotation.findMany({ where: { ...scopeWhere(scope), ...(created ? { createdAt: created } : {}) }, select: { total: true, status: true } }),
  ]);
  const reportOrders = orders.map(toReportOrder);
  return {
    ...computeSales(
      reportOrders,
      customers.map((c) => ({ createdAt: c.createdAt, hasOrder: c.orders.length > 0 })),
      quotations.map((q) => ({ total: Number(q.total), status: q.status })),
    ),
    kitchens: "all" in scope ? computeKitchens(reportOrders) : [],
  };
}

export async function loadEventsReport(scope: ReportScope, range: ReportRange) {
  const when = dateFilter(range, "utc");
  const orders = await prisma.order.findMany({ where: { ...scopeWhere(scope), ...(when ? { eventStartDate: when } : {}) }, select: orderSelect });
  return computeEvents(orders.map(toReportOrder));
}

/** Platform view: how many new caterers joined each month (within the range, by when they signed up). */
export async function loadSignupsByMonth(range: ReportRange) {
  const created = dateFilter(range, "ist");
  const [orgs, total] = await Promise.all([
    prisma.organization.findMany({ where: created ? { createdAt: created } : {}, select: { createdAt: true } }),
    prisma.organization.count(),
  ]);
  const map = new Map<string, number>();
  for (const o of orgs) map.set(monthKey(o.createdAt, "ist"), (map.get(monthKey(o.createdAt, "ist")) ?? 0) + 1);
  return {
    total,
    inRange: orgs.length,
    byMonth: [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, label: monthLabel(month), count })),
  };
}
