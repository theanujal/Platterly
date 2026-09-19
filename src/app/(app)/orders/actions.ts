"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
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
import { listCustomers, createCustomer } from "@/modules/customers/customer";
import { getMenuForOrderPicker, type OrderPickerMenu } from "@/modules/menus/menu";
import type { OrderStatus, OrderPaymentStatus, MealType, OrderKind, EventStatus, PricingMethod, ChildPricingType, VenueType } from "@/generated/prisma/enums";

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

// Create Order's "Event Date" validation (2026-09-19) — never trust the
// client-side copy of this same check in order-form.tsx alone. Measured in
// calendar days (midnight to midnight), not exact 48h, matching how the rest
// of the form already treats dates.
const MIN_DAYS_BEFORE_EVENT = 2;

function daysUntil(date: Date): number {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfEvent = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((startOfEvent.getTime() - startOfToday.getTime()) / 86_400_000);
}

/** Owner/Team Admin only (permissions.ts's `orders: ["bypass_date_restriction"]`) — see RULES.md-style rationale in order-form.tsx's own client-side copy of this check. */
async function assertEventDateAllowed(organizationId: string, eventStartDate: Date) {
  if (daysUntil(eventStartDate) >= MIN_DAYS_BEFORE_EVENT) return;
  const canBypass = await hasPermission({ orders: ["bypass_date_restriction"] }, organizationId);
  if (!canBypass) {
    throw new Error(`Orders can't normally be created less than ${MIN_DAYS_BEFORE_EVENT} days before the event. An Owner or Team Admin can override this.`);
  }
}

export async function createOrderAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["create"] }, organizationId);
  try {
    const input = buildInput(formData);
    await assertEventDateAllowed(organizationId, input.eventStartDate);
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
    await assertEventDateAllowed(organizationId, input.eventStartDate);
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
    await assertEventDateAllowed(organizationId, input.eventStartDate);
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
    await assertEventDateAllowed(organizationId, input.eventStartDate);
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
    await assertEventDateAllowed(organizationId, startDate);

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
export async function getMenuForOrderPickerAction(menuId: string): Promise<OrderPickerMenu | null> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["view"] }, organizationId);
  return getMenuForOrderPicker(organizationId, menuId);
}
