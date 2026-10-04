import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { EventStatus, FoodType, OrderStatus, AddOnType } from "@/generated/prisma/enums";

/**
 * Chunk 25 — the public API's reads. Every query starts from `organizationId` (taken from the API key, never from the
 * request) and selects only the columns the serializers expose. Pages are always bounded (`take`).
 */
export interface Page {
  skip: number;
  take: number;
}

const customerSelect = { id: true, name: true, phone: true, email: true, isActive: true, leadSource: true, createdAt: true, updatedAt: true, _count: { select: { orders: true } } } satisfies Prisma.CustomerSelect;

export async function pageCustomers(organizationId: string, f: { status?: "LEAD" | "CUSTOMER"; search?: string }, p: Page) {
  const where: Prisma.CustomerWhereInput = {
    organizationId,
    ...(f.status === "CUSTOMER" ? { orders: { some: {} } } : {}),
    ...(f.status === "LEAD" ? { orders: { none: {} } } : {}),
    ...(f.search ? { OR: [{ name: { contains: f.search, mode: "insensitive" } }, { phone: { contains: f.search, mode: "insensitive" } }, { email: { contains: f.search, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([prisma.customer.findMany({ where, select: customerSelect, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: p.skip, take: p.take }), prisma.customer.count({ where })]);
  return { rows, total };
}

export const getCustomerRow = (organizationId: string, id: string) => prisma.customer.findFirst({ where: { id, organizationId }, select: customerSelect });

const menuSelect = {
  id: true, name: true, description: true, image: true, menuType: true, pricePerPlate: true, isActive: true,
  childUnder5Chargeable: true, childUnder5Price: true, child5To10PricingType: true, child5To10PriceValue: true, createdAt: true, updatedAt: true,
} satisfies Prisma.MenuSelect;

export async function pageMenus(organizationId: string, f: { is_active?: boolean; menu_type?: FoodType }, p: Page) {
  const where: Prisma.MenuWhereInput = { organizationId, ...(f.is_active === undefined ? {} : { isActive: f.is_active }), ...(f.menu_type ? { menuType: f.menu_type } : {}) };
  const [rows, total] = await Promise.all([prisma.menu.findMany({ where, select: menuSelect, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }, { id: "asc" }], skip: p.skip, take: p.take }), prisma.menu.count({ where })]);
  return { rows, total };
}

/** One menu with its dishes and categories (the list leaves these out). */
export async function getMenuRow(organizationId: string, id: string) {
  return prisma.menu.findFirst({
    where: { id, organizationId },
    select: {
      ...menuSelect,
      items: { orderBy: { sortOrder: "asc" }, select: { menuItem: { select: { id: true, name: true, foodType: true, price: true, isActive: true } } } },
      categoryAssignments: { orderBy: { sortOrder: "asc" }, select: { category: { select: { id: true, name: true } } } },
    },
  });
}

const menuItemSelect = { id: true, name: true, description: true, image: true, foodType: true, price: true, isActive: true, isPopular: true, isChefsSpecial: true, isLiveCounter: true, createdAt: true, updatedAt: true } satisfies Prisma.MenuItemSelect;

export async function pageMenuItems(organizationId: string, f: { is_active?: boolean; food_type?: FoodType; category_id?: string; search?: string }, p: Page) {
  const where: Prisma.MenuItemWhereInput = {
    organizationId,
    ...(f.is_active === undefined ? {} : { isActive: f.is_active }),
    ...(f.food_type ? { foodType: f.food_type } : {}),
    ...(f.category_id ? { categories: { some: { categoryId: f.category_id } } } : {}),
    ...(f.search ? { name: { contains: f.search, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([prisma.menuItem.findMany({ where, select: menuItemSelect, orderBy: [{ name: "asc" }, { id: "asc" }], skip: p.skip, take: p.take }), prisma.menuItem.count({ where })]);
  return { rows, total };
}

export const getMenuItemRow = (organizationId: string, id: string) =>
  prisma.menuItem.findFirst({ where: { id, organizationId }, select: { ...menuItemSelect, categories: { select: { category: { select: { id: true, name: true } } } } } });

const addOnSelect = { id: true, name: true, description: true, image: true, type: true, priceType: true, price: true, includedInPackage: true, isActive: true, createdAt: true, updatedAt: true } satisfies Prisma.AddOnSelect;

export async function pageAddOns(organizationId: string, f: { is_active?: boolean; type?: AddOnType }, p: Page) {
  const where: Prisma.AddOnWhereInput = { organizationId, ...(f.is_active === undefined ? {} : { isActive: f.is_active }), ...(f.type ? { type: f.type } : {}) };
  const [rows, total] = await Promise.all([prisma.addOn.findMany({ where, select: addOnSelect, orderBy: [{ name: "asc" }, { id: "asc" }], skip: p.skip, take: p.take }), prisma.addOn.count({ where })]);
  return { rows, total };
}

export const getAddOnRow = (organizationId: string, id: string) => prisma.addOn.findFirst({ where: { id, organizationId }, select: addOnSelect });

const eventSelect = {
  id: true, name: true, status: true, startDate: true, endDate: true, venue: true, guestCount: true, orderId: true, customerId: true, eventTypeId: true, assignedKitchenId: true, createdAt: true, updatedAt: true,
  eventType: { select: { name: true } },
  assignedKitchen: { select: { name: true } },
} satisfies Prisma.EventSelect;

export async function pageEvents(organizationId: string, f: { status?: EventStatus; customer_id?: string; from?: Date; to?: Date }, p: Page) {
  const where: Prisma.EventWhereInput = {
    organizationId,
    ...(f.status ? { status: f.status } : {}),
    ...(f.customer_id ? { customerId: f.customer_id } : {}),
    ...(f.from || f.to ? { startDate: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([prisma.event.findMany({ where, select: eventSelect, orderBy: [{ startDate: "desc" }, { id: "asc" }], skip: p.skip, take: p.take }), prisma.event.count({ where })]);
  return { rows, total };
}

export const getEventRow = (organizationId: string, id: string) => prisma.event.findFirst({ where: { id, organizationId }, select: eventSelect });

const mealPlanSelect = {
  id: true, orderId: true, date: true, mealType: true, price: true, menuId: true,
  menu: { select: { name: true } },
  items: { orderBy: { createdAt: "asc" }, select: { id: true, itemType: true, menuId: true, menuItemId: true, addOnId: true, name: true, unitPrice: true, quantity: true, isExtra: true } },
} satisfies Prisma.MealPlanEntrySelect;

/** The meal plan hangs off the order; an order belongs to the kitchen, so the tenant check goes through it. */
export const mealPlansOfOrder = (organizationId: string, orderId: string) =>
  prisma.mealPlanEntry.findMany({ where: { orderId, order: { organizationId } }, select: mealPlanSelect, orderBy: [{ date: "asc" }, { mealType: "asc" }] });

export const getMealPlanRow = (organizationId: string, id: string) => prisma.mealPlanEntry.findFirst({ where: { id, order: { organizationId } }, select: mealPlanSelect });

export const orderSelect = {
  id: true, orderNumber: true, status: true, orderKind: true, customerId: true, eventTypeId: true, eventStartDate: true, eventEndDate: true, venue: true, eventAddress: true, menuPreference: true,
  adultCount: true, childBelow5Count: true, child5To10Count: true, totalParticipants: true,
  subtotal: true, childrenCharge: true, transportationCost: true, otherCharges: true, discount: true, total: true, advance: true, balance: true, paymentStatus: true, notes: true, createdAt: true, updatedAt: true,
  customer: { select: { name: true } },
  eventType: { select: { name: true } },
  events: { orderBy: { createdAt: "asc" }, select: { id: true, menuSelection: { select: { kitchenProductionStatus: true } } } },
} satisfies Prisma.OrderSelect;

export async function pageOrders(organizationId: string, f: { status?: OrderStatus; customer_id?: string; event_from?: Date; event_to?: Date }, p: Page) {
  const where: Prisma.OrderWhereInput = {
    organizationId,
    ...(f.status ? { status: f.status } : {}),
    ...(f.customer_id ? { customerId: f.customer_id } : {}),
    ...(f.event_from || f.event_to ? { eventStartDate: { ...(f.event_from ? { gte: f.event_from } : {}), ...(f.event_to ? { lte: f.event_to } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([prisma.order.findMany({ where, select: orderSelect, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: p.skip, take: p.take }), prisma.order.count({ where })]);
  return { rows, total };
}

export const getOrderRow = (organizationId: string, id: string) => prisma.order.findFirst({ where: { id, organizationId }, select: orderSelect });
