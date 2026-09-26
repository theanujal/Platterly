"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import {
  createOrder,
  updateOrder,
  deleteOrder,
  getOrder,
  sendOrderWhatsApp,
  syncOrderEvent,
  type OrderInput,
  type OrderItemCatalogInput,
  type MealPlanEntryInput,
} from "@/modules/orders/order";
import { getEvent, updateEventOperations, type RequiredInventoryInput } from "@/modules/events/event";
import { listCustomers, createCustomer } from "@/modules/customers/customer";
import { listAddOns } from "@/modules/addons/addon";
import { getMenuForOrderPicker, type OrderPickerMenu } from "@/modules/menus/menu";
import { getOrderCountsByDay } from "@/modules/orders/calendar";
import { isBackdated } from "@/modules/orders/event-date-rule";
import type { OrderStatus, OrderPaymentStatus, MealType, OrderKind, EventStatus, FoodType, PricingMethod, ChildPricingType, VenueType } from "@/generated/prisma/enums";

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

function buildMealPlanEntries(formData: FormData): MealPlanEntryInput[] {
  const dates = formData.getAll("mealDate").filter((v): v is string => typeof v === "string");
  const mealTypes = formData.getAll("mealType").filter((v): v is string => typeof v === "string");
  const prices = formData.getAll("mealPrice").filter((v): v is string => typeof v === "string");
  const menuIds = formData.getAll("mealMenuId").filter((v): v is string => typeof v === "string");
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
    menuPreference: (stringField(formData, "menuPreference") as FoodType | undefined) ?? null,
    orderKind: (stringField(formData, "orderKind") as OrderKind | undefined) ?? "SINGLE",
    eventStartDate,
    eventEndDate,
    venue: stringField(formData, "venue"),
    eventAddress: stringField(formData, "eventAddress"),
    venueType: (stringField(formData, "venueType") as VenueType | undefined) ?? null,
    venueLandmark: stringField(formData, "venueLandmark"),
    venueContactName: stringField(formData, "venueContactName"),
    venueContactPhone: stringField(formData, "venueContactPhone"),
    liveCounterAvailable: formData.get("liveCounterAvailable") === "true",
    gasElectricAvailable: formData.get("gasElectricAvailable") === "true",
    deliveryInstructions: stringField(formData, "deliveryInstructions"),
    cookingInstructions: stringField(formData, "cookingInstructions"),
    adultCount: numberField(formData, "adultCount") ?? null,
    childBelow5Count: numberField(formData, "childBelow5Count") ?? null,
    child5To10Count: numberField(formData, "child5To10Count") ?? null,
    // childPricingMenuId is NOT read from the form (AJ, 2026-09-19) — no
    // separate children's-menu selector exists anymore; order.ts derives it
    // server-side from the first Meal Planning entry's own Menu when
    // pricingMethod is STANDARD.
    pricingMethod: (stringField(formData, "pricingMethod") as PricingMethod | undefined) ?? "STANDARD",
    individualChildBelow5Rate: numberField(formData, "individualChildBelow5Rate") ?? null,
    individualChildBelow5PricingType: (stringField(formData, "individualChildBelow5PricingType") as ChildPricingType | undefined) ?? null,
    individualChild5To10Rate: numberField(formData, "individualChild5To10Rate") ?? null,
    individualChild5To10PricingType: (stringField(formData, "individualChild5To10PricingType") as ChildPricingType | undefined) ?? null,
    totalParticipants: numberField(formData, "totalParticipants") ?? null,
    // adultNonVegCount/adultVegCount deliberately NOT read here (AJ,
    // 2026-09-19 — removed from the order flow entirely). Leaving these keys
    // out of OrderInput (rather than setting them to `null`) means Prisma's
    // update() leaves any pre-existing values untouched instead of wiping
    // them — no backend/data-structure change, just no longer written from
    // this form. createOrder still defaults an omitted key to the column's
    // own null default on insert.
    individualPricingEnabled: formData.get("individualPricingEnabled") === "true",
    discount: numberField(formData, "discount") ?? 0,
    transportationCost: numberField(formData, "transportationCost") ?? 0,
    otherCharges: numberField(formData, "otherCharges") ?? 0,
    advance: numberField(formData, "advance") ?? 0,
    paymentStatus: stringField(formData, "paymentStatus") as OrderPaymentStatus | undefined,
    status: stringField(formData, "status") as OrderStatus | undefined,
    notes: stringField(formData, "notes"),
    kitchenNotes: stringField(formData, "kitchenNotes"),
    mealPlanEntries: buildMealPlanEntries(formData),
  };
}

/** No backdated orders (AJ, 2026-09-27) — the server-side copy of order-form.tsx's own check; see modules/orders/event-date-rule.ts. */
function assertEventDateAllowed(eventStartDate: Date, unchangedFrom?: Date) {
  if (isBackdated(eventStartDate, unchangedFrom)) throw new Error("Event Date can't be in the past.");
}

export async function createOrderAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["create"] }, organizationId);
  try {
    const input = buildInput(formData);
    assertEventDateAllowed(input.eventStartDate);
    const order = await createOrder(organizationId, input, session.user.id);
    await syncOrderEvent(organizationId, order.id, session.user.id);
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
    assertEventDateAllowed(input.eventStartDate);
    const order = await createOrder(organizationId, input, session.user.id);
    await syncOrderEvent(organizationId, order.id, session.user.id);
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
    assertEventDateAllowed(input.eventStartDate, (await getOrder(organizationId, id))?.eventStartDate);
    await updateOrder(organizationId, id, input, session.user.id);
    await syncOrderEvent(organizationId, id, session.user.id);
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
    assertEventDateAllowed(input.eventStartDate, (await getOrder(organizationId, id))?.eventStartDate);
    await updateOrder(organizationId, id, input, session.user.id);
    await syncOrderEvent(organizationId, id, session.user.id);
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

/**
 * The Order page's kitchen / event status / required inventory cards
 * (AJ, 2026-09-27). They save as you change them, so this takes one field at
 * a time; the rest of an Event follows its Order (see syncOrderEvent).
 */
export async function updateEventOperationsAction(
  orderId: string,
  eventId: string,
  patch: { assignedKitchenId?: string | null; status?: EventStatus; requiredInventory?: RequiredInventoryInput[] },
): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["edit"] }, organizationId);
  try {
    const event = await getEvent(organizationId, eventId);
    if (!event || event.orderId !== orderId) throw new Error("Event not found.");
    await updateEventOperations(organizationId, eventId, patch, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export interface CustomerSearchResult {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

/**
 * Create Order's Customer search-autocomplete (2026-09-19) — same
 * debounce-on-the-client / short-query-guard pattern as `searchOrdersAction`
 * (src/app/(app)/actions.ts), but querying Customers by name/phone directly
 * rather than Orders.
 */
export async function searchCustomersAction(query: string): Promise<CustomerSearchResult[]> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ customers: ["view"] }, organizationId);
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const customers = await listCustomers(organizationId, { search: trimmed, take: 8 });
  return customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email }));
}

export type CreateCustomerForOrderResult =
  | { ok: true; customer: { id: string; name: string; phone: string } }
  | { ok: false; error: string };

/**
 * Create Order's inline "this customer doesn't exist yet" flow (2026-09-19)
 * — reuses the same `createCustomer` module function as
 * `customers/actions.ts`'s own `createCustomerAction`, but returns the
 * created row (instead of just `{ok:true}` + a `/customers` revalidate) so
 * the order form can select it immediately without a page navigation.
 */
export async function createCustomerForOrderAction(formData: FormData): Promise<CreateCustomerForOrderResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ customers: ["create"] }, organizationId);
  const name = stringField(formData, "name");
  if (!name) return { ok: false, error: "Customer name is required." };
  const phone = stringField(formData, "phone");
  if (!phone) return { ok: false, error: "Phone is required." };
  try {
    const customer = await createCustomer(organizationId, { name, phone, email: stringField(formData, "email") }, session.user.id);
    return { ok: true, customer: { id: customer.id, name: customer.name, phone: customer.phone } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

/**
 * Create Order redesign (2026-09-20) — the "Select Food Items" dialog's
 * data source, fetched on demand once a meal assigns a Menu rather than
 * preloading every Menu's items up front for every Order form load.
 */
export interface OrderPickerAddOn {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  price: number;
  priceType: "PER_PLATE" | "FIXED";
}

/** The picker drawer's data: the Menu's category-grouped items plus the active Add-ons (AJ, 2026-09-27). */
export type OrderPickerData = OrderPickerMenu & { addOns: OrderPickerAddOn[] };

export async function getMenuForOrderPickerAction(menuId: string): Promise<OrderPickerData | null> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["view"] }, organizationId);
  const [menu, addOns] = await Promise.all([getMenuForOrderPicker(organizationId, menuId), listAddOns(organizationId)]);
  if (!menu) return null;
  return {
    ...menu,
    addOns: addOns
      .filter((a) => a.isActive)
      .map((a) => ({ id: a.id, name: a.name, description: a.description, image: a.image, price: Number(a.price), priceType: a.priceType })),
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Feeds the Create Order date picker's busy-ness lines (Chunk 13 Group 13.1)
 * for whichever month the picker is showing. Same aggregation as the
 * Dashboard card and /calendar page (`getOrderCountsByDay`), so all three
 * always agree. Window is capped so a forged range can't scan the whole table.
 */
export async function getOrderCountsByDayAction(fromIso: string, toIso: string): Promise<Record<string, number>> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["view"] }, organizationId);
  if (!ISO_DAY.test(fromIso) || !ISO_DAY.test(toIso)) return {};
  const spanDays = (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000;
  if (spanDays < 0 || spanDays > 62) return {};
  return getOrderCountsByDay(organizationId, fromIso, toIso);
}
