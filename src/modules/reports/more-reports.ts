import "server-only";
import { prisma } from "@/lib/db";
import type { ExpenseCategoryValue } from "@/modules/expenses/profitability";
import { VISIT_SOURCE_LABEL } from "@/modules/storefront-visits/visit-math";
import { byLocation, dateFilter, orderScope, scopeWhere, type ReportRange, type ReportScope } from "./reports";
import { sharedOrAt } from "@/modules/locations/scope";
import { computeMenuReport } from "./menu-math";
import { computeMovements, computePurchases, computeStock } from "./inventory-math";
import { computeFinance, computePayables, computeReceivables } from "./finance-math";
import { computeChannels, computeStorefront, type DraftRow, type VisitRow } from "./storefront-math";

/**
 * Chunk 22 — loads the rows the Menu, Inventory, Finance and Storefront reports are built from. One kitchen
 * (`{ organizationId }`) or the whole platform (`{ all: true }`, Super Admin only; the caller must have checked that).
 * The figures come from the `*-math.ts` files next to this one.
 */

export async function loadMenuReport(scope: ReportScope, range: ReportRange) {
  const created = dateFilter(range, "ist");
  const [orders, catalog] = await Promise.all([
    prisma.order.findMany({
      where: { ...orderScope(scope), status: { not: "CANCELLED" }, ...(created ? { createdAt: created } : {}) },
      select: {
        id: true,
        total: true,
        mealPlanEntries: { select: { menuId: true, menu: { select: { name: true } }, items: { where: { itemType: "MENU_ITEM" }, select: { menuItemId: true, name: true, isExtra: true } } } },
      },
    }),
    "organizationId" in scope ? prisma.menuItem.findMany({ where: { organizationId: scope.organizationId }, select: { id: true, name: true, isActive: true } }) : Promise.resolve([]),
  ]);
  return computeMenuReport(
    orders.map((o) => ({
      id: o.id,
      total: Number(o.total),
      meals: o.mealPlanEntries.map((m) => ({ menuId: m.menuId, menuName: m.menu?.name ?? null, dishes: m.items.map((i) => ({ id: i.menuItemId, name: i.name, isExtra: i.isExtra })) })),
    })),
    catalog,
  );
}

export async function loadInventoryReport(scope: ReportScope, range: ReportRange) {
  const when = dateFilter(range, "ist");
  const locationId = "organizationId" in scope ? scope.locationId : null;
  const [items, transactions, purchaseOrders] = await Promise.all([
    prisma.inventory.findMany({ where: { ...scopeWhere(scope), ...sharedOrAt(locationId) }, select: { id: true, name: true, category: true, unit: true, stockCount: true, costPerUnit: true, lowStockThreshold: true, expiryDate: true } }),
    prisma.inventoryTransaction.findMany({
      where: { inventory: { ...scopeWhere(scope), ...sharedOrAt(locationId) }, ...(when ? { createdAt: when } : {}) },
      select: { type: true, quantity: true, inventoryId: true, orderId: true, inventory: { select: { name: true, unit: true, costPerUnit: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { ...scopeWhere(scope), ...sharedOrAt(locationId), status: { in: ["ORDERED", "PARTIALLY_RECEIVED", "RECEIVED"] }, ...(when ? { orderedAt: when } : {}) },
      select: { id: true, supplier: { select: { id: true, name: true } }, items: { select: { quantity: true, receivedQuantity: true, unitCost: true } } },
    }),
  ]);
  return {
    stock: computeStock(
      items.map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        unit: i.unit,
        stock: Number(i.stockCount),
        costPerUnit: i.costPerUnit === null ? null : Number(i.costPerUnit),
        lowStockThreshold: i.lowStockThreshold === null ? null : Number(i.lowStockThreshold),
        expiryDate: i.expiryDate,
      })),
    ),
    movements: computeMovements(
      transactions.map((t) => ({
        type: t.type,
        quantity: Number(t.quantity),
        inventoryId: t.inventoryId,
        name: t.inventory.name,
        unit: t.inventory.unit,
        costPerUnit: t.inventory.costPerUnit === null ? null : Number(t.inventory.costPerUnit),
        forOrder: t.orderId !== null,
      })),
    ),
    purchases: computePurchases(
      purchaseOrders.map((po) => ({
        id: po.id,
        lines: po.items.map((l) => ({ supplierId: po.supplier.id, supplierName: po.supplier.name, quantity: Number(l.quantity), receivedQuantity: Number(l.receivedQuantity), unitCost: Number(l.unitCost) })),
      })),
    ),
  };
}

export async function loadFinanceReport(scope: ReportScope, range: ReportRange, now: Date = new Date()) {
  const created = dateFilter(range, "ist");
  const spent = dateFilter(range, "utc");
  const located = "organizationId" in scope && Boolean(scope.locationId);
  const [orders, expenses, owing, receipts, payments] = await Promise.all([
    prisma.order.findMany({ where: { ...orderScope(scope), ...(created ? { createdAt: created } : {}) }, select: { total: true, createdAt: true, status: true } }),
    // A company expense belongs to no location, so a location only counts the expenses of its own orders.
    prisma.expense.findMany({ where: { ...scopeWhere(scope), ...(located ? { order: orderScope(scope) } : {}), ...(spent ? { spentAt: spent } : {}) }, select: { amount: true, spentAt: true, category: true } }),
    prisma.order.findMany({
      where: { ...orderScope(scope), status: { not: "CANCELLED" }, balance: { gt: 0 } },
      select: { id: true, orderNumber: true, balance: true, eventStartDate: true, customer: { select: { name: true } }, organization: { select: { name: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { ...scopeWhere(scope), ...sharedOrAt("organizationId" in scope ? scope.locationId : null), status: { in: ["PARTIALLY_RECEIVED", "RECEIVED"] } },
      select: { receivedAt: true, orderedAt: true, createdAt: true, supplier: { select: { id: true, name: true } }, items: { select: { receivedQuantity: true, unitCost: true } } },
    }),
    prisma.supplierPayment.groupBy({ by: ["supplierId"], where: scopeWhere(scope), _sum: { amount: true } }),
  ]);

  const suppliers = new Map<string, { supplierName: string; received: { date: Date; value: number }[]; paid: number }>();
  for (const po of receipts) {
    const value = po.items.reduce((sum, l) => sum + Number(l.receivedQuantity) * Number(l.unitCost), 0);
    if (value <= 0) continue;
    const entry = suppliers.get(po.supplier.id) ?? { supplierName: po.supplier.name, received: [], paid: 0 };
    entry.received.push({ date: po.receivedAt ?? po.orderedAt ?? po.createdAt, value });
    suppliers.set(po.supplier.id, entry);
  }
  for (const p of payments) {
    const entry = suppliers.get(p.supplierId);
    if (entry) entry.paid = Number(p._sum.amount ?? 0);
  }

  return {
    finance: computeFinance(
      orders.map((o) => ({ total: Number(o.total), createdAt: o.createdAt, status: o.status })),
      expenses.map((e) => ({ amount: Number(e.amount), spentAt: e.spentAt, category: e.category as ExpenseCategoryValue })),
    ),
    receivables: computeReceivables(
      owing.map((o) => ({ id: o.id, orderNumber: o.orderNumber, customerName: o.customer.name, eventDate: o.eventStartDate, balance: Number(o.balance), kitchenName: o.organization.name })),
      now,
    ),
    payables: computePayables(
      [...suppliers.entries()].map(([supplierId, s]) => ({ supplierId, supplierName: s.supplierName, received: s.received, paid: s.paid })),
      now,
    ),
  };
}

export interface RecentVisitor {
  visitedAt: Date;
  sourceLabel: string;
  sourceDetail: string | null;
  device: string;
  browser: string | null;
  place: string;
  ipAddress: string | null;
}

const DEVICE_NAME = { MOBILE: "Phone", TABLET: "Tablet", DESKTOP: "Computer" } as const;

export async function loadStorefrontReport(scope: ReportScope, range: ReportRange, options: { recent?: boolean } = {}) {
  const when = dateFilter(range, "ist");
  const [visits, drafts, orders, completedDrafts, recent] = await Promise.all([
    // Visits and drafts happen before anyone has chosen a location (there is one public link), so a location-scoped
    // report leaves them out and keeps only the orders.
    byLocation(scope) ? Promise.resolve([]) : prisma.storefrontVisit.findMany({
      where: { ...scopeWhere(scope), ...(when ? { visitedAt: when } : {}) },
      select: { id: true, visitedAt: true, source: true, sourceDetail: true, device: true, browser: true, country: true, city: true, visitorKey: true },
    }),
    byLocation(scope) ? Promise.resolve([]) : prisma.storefrontDraft.findMany({ where: { ...scopeWhere(scope), ...(when ? { createdAt: when } : {}) }, select: { visitId: true, status: true, currentStep: true } }),
    prisma.order.findMany({ where: { ...orderScope(scope), ...(when ? { createdAt: when } : {}) }, select: { id: true, total: true, status: true, quotationId: true } }),
    prisma.storefrontDraft.findMany({ where: { ...scopeWhere(scope), status: "COMPLETED", orderId: { not: null } }, select: { orderId: true } }),
    options.recent && "organizationId" in scope && !byLocation(scope)
      ? prisma.storefrontVisit.findMany({ where: { organizationId: scope.organizationId, ...(when ? { visitedAt: when } : {}) }, orderBy: { visitedAt: "desc" }, take: 25 })
      : Promise.resolve([]),
  ]);
  const rangeDays = range.from && range.to ? Math.round((range.to.getTime() - range.from.getTime()) / 86400000) + 1 : null;
  const storefrontOrderIds = new Set(completedDrafts.map((d) => d.orderId));
  return {
    storefront: computeStorefront(visits as VisitRow[], drafts as DraftRow[], rangeDays),
    channels: computeChannels(orders.map((o) => ({ fromStorefront: storefrontOrderIds.has(o.id), fromQuotation: o.quotationId !== null, total: Number(o.total), status: o.status }))),
    recent: recent.map<RecentVisitor>((v) => ({
      visitedAt: v.visitedAt,
      sourceLabel: VISIT_SOURCE_LABEL[v.source],
      sourceDetail: v.sourceDetail,
      device: DEVICE_NAME[v.device],
      browser: v.browser,
      place: [v.city, v.country].filter(Boolean).join(", "),
      ipAddress: v.ipAddress,
    })),
  };
}
