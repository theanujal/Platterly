"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import {
  createOrder,
  updateOrder,
  deleteOrder,
  sendOrderWhatsApp,
  createEventForOrder,
  type OrderInput,
  type OrderItemCatalogInput,
  type MealPlanEntryInput,
} from "@/modules/orders/order";
import { getEvent, updateEvent, deleteEvent, type RequiredInventoryInput } from "@/modules/events/event";
import type { OrderStatus, OrderPaymentStatus, OrderItemType, MealType, OrderKind, EventStatus } from "@/generated/prisma/enums";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function numberField(formData: FormData, name: string): number | undefined {
  const raw = stringField(formData, name);
  if (raw === undefined) return undefined;
  const parsed = Number.parseFloat(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function dateField(formData: FormData, name: string): Date | undefined {
  const raw = stringField(formData, name);
  if (raw === undefined) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function buildItems(formData: FormData): OrderItemCatalogInput[] {
  const itemTypes = formData.getAll("itemType").filter((v): v is string => typeof v === "string");
  const catalogIds = formData.getAll("catalogId").filter((v): v is string => typeof v === "string");
  const quantities = formData.getAll("quantity").filter((v): v is string => typeof v === "string");
  return itemTypes.map((itemType, index) => ({
    itemType: itemType as OrderItemType,
    catalogId: catalogIds[index],
    quantity: Number.parseInt(quantities[index] ?? "1", 10) || 1,
  }));
}

function buildMealPlanEntries(formData: FormData): MealPlanEntryInput[] {
  const dates = formData.getAll("mealDate").filter((v): v is string => typeof v === "string");
  const mealTypes = formData.getAll("mealType").filter((v): v is string => typeof v === "string");
  const prices = formData.getAll("mealPrice").filter((v): v is string => typeof v === "string");
  const menuIds = formData.getAll("mealMenuId").filter((v): v is string => typeof v === "string");
  const childBelow5Counts = formData.getAll("mealChildBelow5Count").filter((v): v is string => typeof v === "string");
  const child5To10Counts = formData.getAll("mealChild5To10Count").filter((v): v is string => typeof v === "string");
  // One JSON-encoded OrderItemCatalogInput[] per slot, aligned by index with
  // the arrays above — a slot's item count varies, so a flat parallel array
  // of scalars (like the others here) can't represent it.
  const itemsJson = formData.getAll("mealItems").filter((v): v is string => typeof v === "string");
  return dates.map((date, index) => {
    let items: OrderItemCatalogInput[] = [];
    try {
      const parsed = JSON.parse(itemsJson[index] ?? "[]");
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      items = [];
    }
    return {
      date: new Date(date),
      mealType: mealTypes[index] as MealType,
      price: Number.parseFloat(prices[index] ?? "0") || undefined,
      menuId: menuIds[index] || null,
      items,
      childBelow5Count: Number.parseInt(childBelow5Counts[index] ?? "0", 10) || 0,
      child5To10Count: Number.parseInt(child5To10Counts[index] ?? "0", 10) || 0,
    };
  });
}

function buildInput(formData: FormData): OrderInput {
  const customerId = stringField(formData, "customerId");
  if (!customerId) throw new Error("A Customer is required.");
  const eventStartDate = dateField(formData, "eventStartDate");
  if (!eventStartDate) throw new Error("A valid Event Start Date is required.");
  const eventEndDate = dateField(formData, "eventEndDate");
  if (!eventEndDate) throw new Error("A valid Event End Date is required.");
  if (eventEndDate < eventStartDate) throw new Error("Event End Date can't be before Start Date.");

  return {
    customerId,
    eventTypeId: stringField(formData, "eventTypeId") ?? null,
    orderKind: (stringField(formData, "orderKind") as OrderKind | undefined) ?? "SINGLE",
    eventStartDate,
    eventEndDate,
    venue: stringField(formData, "venue"),
    eventAddress: stringField(formData, "eventAddress"),
    adultCount: numberField(formData, "adultCount") ?? null,
    childBelow5Count: numberField(formData, "childBelow5Count") ?? null,
    child5To10Count: numberField(formData, "child5To10Count") ?? null,
    childPricingMenuId: stringField(formData, "childPricingMenuId") ?? null,
    totalParticipants: numberField(formData, "totalParticipants") ?? null,
    adultNonVegCount: numberField(formData, "adultNonVegCount") ?? null,
    adultVegCount: numberField(formData, "adultVegCount") ?? null,
    individualPricingEnabled: formData.get("individualPricingEnabled") === "true",
    discount: numberField(formData, "discount") ?? 0,
    taxes: numberField(formData, "taxes") ?? 0,
    advance: numberField(formData, "advance") ?? 0,
    paymentStatus: stringField(formData, "paymentStatus") as OrderPaymentStatus | undefined,
    status: stringField(formData, "status") as OrderStatus | undefined,
    notes: stringField(formData, "notes"),
    items: buildItems(formData),
    mealPlanEntries: buildMealPlanEntries(formData),
  };
}

export async function createOrderAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["create"] }, organizationId);
  try {
    const input = buildInput(formData);
    await createOrder(organizationId, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/orders");
  return { ok: true };
}

export async function createOrderAndNotifyAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["create"] }, organizationId);
  try {
    const input = buildInput(formData);
    const order = await createOrder(organizationId, input, session.user.id);
    await sendOrderWhatsApp(organizationId, order.id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/orders");
  return { ok: true };
}

export async function updateOrderAction(id: string, formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["edit"] }, organizationId);
  try {
    const input = buildInput(formData);
    await updateOrder(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  return { ok: true };
}

export async function updateOrderAndNotifyAction(id: string, formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["edit"] }, organizationId);
  try {
    const input = buildInput(formData);
    await updateOrder(organizationId, id, input, session.user.id);
    await sendOrderWhatsApp(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  return { ok: true };
}

export async function deleteOrderAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["delete"] }, organizationId);
  try {
    await deleteOrder(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/orders");
  return { ok: true };
}

/** Group 10.6 — the inline "Yes, create event" action on the Order detail page. */
export async function createEventForOrderAction(orderId: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["edit"], events: ["create"] }, organizationId);
  try {
    await createEventForOrder(organizationId, orderId, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

function buildRequiredInventory(formData: FormData): RequiredInventoryInput[] {
  const ids = formData.getAll("requiredInventoryId").filter((v): v is string => typeof v === "string");
  const quantities = formData.getAll("requiredInventoryQuantity").filter((v): v is string => typeof v === "string");
  return ids.map((inventoryId, index) => ({
    inventoryId,
    quantity: Number.parseFloat(quantities[index] ?? "0") || 0,
  }));
}

/**
 * The Order/Event judgment call (dev plans/index.md #14): a linked Event is
 * now fully editable inline from the Order detail page — the standalone
 * `/events/[id]` page (Chunk 9) was removed once every Event started coming
 * from an Order (AJ, 2026-09-16), so this is the only place left that edits
 * an Event's own fields, including what a smaller draft of this form used
 * to leave untouched (name, dates, status, required inventory) and what the
 * standalone page alone used to expose (status, required inventory, delete
 * — see deleteOrderEventAction below). Customer reassignment is deliberately
 * NOT exposed here — an Event's customer follows its Order's.
 */
export async function updateOrderEventAction(eventId: string, formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["edit"] }, organizationId);
  try {
    const current = await getEvent(organizationId, eventId);
    if (!current) throw new Error("Event not found.");
    const eventTypeId = stringField(formData, "eventTypeId");
    if (!eventTypeId) throw new Error("Event Type is required.");
    const name = stringField(formData, "name");
    if (!name) throw new Error("Event Name is required.");
    const startDate = dateField(formData, "startDate");
    if (!startDate) throw new Error("A valid Start Date is required.");
    const endDate = dateField(formData, "endDate");
    if (!endDate) throw new Error("A valid End Date is required.");
    if (endDate < startDate) throw new Error("End Date can't be before Start Date.");

    await updateEvent(
      organizationId,
      eventId,
      {
        customerId: current.customerId,
        eventTypeId,
        assignedKitchenId: stringField(formData, "assignedKitchenId") ?? null,
        name,
        startDate,
        endDate,
        venue: stringField(formData, "venue"),
        guestCount: numberField(formData, "guestCount") ?? null,
        notes: stringField(formData, "notes"),
        status: stringField(formData, "status") as EventStatus | undefined,
        requiredInventory: buildRequiredInventory(formData),
      },
      session.user.id,
    );
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/orders");
  return { ok: true };
}

/** Folded in from the deleted standalone `/events/[id]` page's DeleteEventButton. */
export async function deleteOrderEventAction(orderId: string, eventId: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["delete"] }, organizationId);
  try {
    await deleteEvent(organizationId, eventId, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
