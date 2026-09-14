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
import { getEvent, updateEvent } from "@/modules/events/event";
import type { OrderStatus, OrderPaymentStatus, OrderItemType, MealType } from "@/generated/prisma/enums";

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
  return dates.map((date, index) => ({
    date: new Date(date),
    mealType: mealTypes[index] as MealType,
    price: Number.parseFloat(prices[index] ?? "0") || undefined,
  }));
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
    eventStartDate,
    eventEndDate,
    venue: stringField(formData, "venue"),
    eventAddress: stringField(formData, "eventAddress"),
    adultCount: numberField(formData, "adultCount") ?? null,
    childCount: numberField(formData, "childCount") ?? null,
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

/**
 * The Order/Event judgment call (dev plans/index.md #14): a linked Event's
 * own operational fields are editable inline from the Order detail page,
 * not just linked out to /events/[id]. Reuses event.ts's own updateEvent —
 * fetches the current row first so fields this small form doesn't expose
 * (name, dates, status, required inventory) survive untouched.
 */
export async function updateOrderEventAction(eventId: string, formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["edit"] }, organizationId);
  try {
    const current = await getEvent(organizationId, eventId);
    if (!current) throw new Error("Event not found.");
    const eventTypeId = stringField(formData, "eventTypeId");
    if (!eventTypeId) throw new Error("Event Type is required.");

    await updateEvent(
      organizationId,
      eventId,
      {
        customerId: current.customerId,
        eventTypeId,
        assignedKitchenId: stringField(formData, "assignedKitchenId") ?? null,
        name: current.name,
        startDate: current.startDate,
        endDate: current.endDate,
        venue: stringField(formData, "venue"),
        guestCount: numberField(formData, "guestCount") ?? null,
        notes: current.notes ?? undefined,
        status: current.status,
      },
      session.user.id,
    );
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/orders");
  return { ok: true };
}
