import "server-only";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { ApiError, notFound } from "@/lib/api/handler";
import { v, parse } from "@/lib/api/schema";
import { createCustomer, updateCustomer, findCustomerByPhone } from "@/modules/customers/customer";
import { createOrder, updateOrder, syncOrderEvent, type MealPlanEntryInput, type OrderInput } from "@/modules/orders/order";
import { isBackdated } from "@/modules/orders/event-date-rule";
import { ensureOrderMenuSelection } from "@/modules/menu-approvals/approval-link";

/**
 * Chunk 25 — the public API's writes. Each one accepts a short, explicit list of fields (anything else is refused),
 * then calls the same module function the app itself uses, so every business rule still applies: plan limits, no
 * backdated orders, prices read from the catalog (never from the caller), customer and menu ids checked against the
 * kitchen. Payment status, advance, discounts, charges and the order status are deliberately not offered.
 */

// ------------------------------------------------------------------------------------------------ customers

export const customerCreateSchema = v.object({
  name: v.string({ max: 200 }),
  phone: v.phone(),
  email: v.optional(v.email()),
  is_enquiry: v.optional(v.boolean()),
  lead_source: v.optional(v.oneOf(["STOREFRONT", "MANUAL_ENTRY", "REFERRAL", "WEBSITE", "SOCIAL_MEDIA", "ADVERTISEMENT", "COLD_CALL", "NETWORKING", "OTHER"] as const)),
});

export const customerPatchSchema = v.object({
  name: v.optional(v.string({ max: 200 })),
  phone: v.optional(v.phone()),
  email: v.optional(v.email()),
  is_active: v.optional(v.boolean()),
});

export async function apiCreateCustomer(organizationId: string, body: unknown): Promise<string> {
  const input = parse(customerCreateSchema, body);
  const existing = await findCustomerByPhone(organizationId, input.phone!);
  if (existing) throw new ApiError(409, "CUSTOMER_ALREADY_EXISTS", "A customer with this phone number already exists.", { customer_id: existing.id });
  const customer = await createCustomer(organizationId, { name: input.name!, phone: input.phone!, email: input.email ?? undefined, isEnquiry: input.is_enquiry ?? false, leadSource: input.lead_source ?? null });
  return customer.id;
}

export async function apiUpdateCustomer(organizationId: string, id: string, body: unknown): Promise<void> {
  const patch = parse(customerPatchSchema, body);
  const before = await prisma.customer.findFirst({ where: { id, organizationId } });
  if (!before) throw notFound("Customer");
  if (patch.phone && normalizePhone(patch.phone) !== before.phone) {
    const clash = await findCustomerByPhone(organizationId, patch.phone);
    if (clash && clash.id !== id) throw new ApiError(409, "CUSTOMER_ALREADY_EXISTS", "Another customer already has this phone number.", { customer_id: clash.id });
  }
  await updateCustomer(organizationId, id, { name: patch.name ?? before.name, phone: patch.phone ?? before.phone, email: patch.email === undefined ? (before.email ?? undefined) : patch.email, isActive: patch.is_active ?? before.isActive });
}

// ------------------------------------------------------------------------------------------------ orders

const MEALS = ["BREAKFAST", "LUNCH", "HITEA", "DINNER", "OTHER"] as const;
const mealPlanSchema = v.object({
  date: v.date(),
  meal_type: v.oneOf(MEALS),
  menu_id: v.optional(v.id()),
  items: v.optional(
    v.array(
      v.object({ item_type: v.oneOf(["MENU_ITEM", "ADD_ON"] as const), catalog_id: v.id(), quantity: v.optional(v.int({ min: 1, max: 100_000 })), is_extra: v.optional(v.boolean()) }),
      { max: 300 },
    ),
  ),
});

const orderFields = {
  event_type_id: v.optional(v.id()),
  event_start_date: v.date(),
  event_end_date: v.optional(v.date()),
  venue: v.optional(v.string({ max: 300 })),
  event_address: v.optional(v.string({ max: 1000 })),
  menu_preference: v.optional(v.oneOf(["VEGETARIAN", "NON_VEGETARIAN"] as const)),
  adult_count: v.optional(v.int({ max: 100_000 })),
  child_below_5_count: v.optional(v.int({ max: 100_000 })),
  child_5_to_10_count: v.optional(v.int({ max: 100_000 })),
  notes: v.optional(v.string({ max: 5000 })),
  meal_plans: v.optional(v.array(mealPlanSchema, { max: 60 })),
};

export const orderCreateSchema = v.object({ customer_id: v.id(), ...orderFields });
export const orderPatchSchema = v.object({ customer_id: v.optional(v.id()), ...orderFields, event_start_date: v.optional(v.date()) });

interface PlanBody {
  date?: Date;
  meal_type?: (typeof MEALS)[number];
  menu_id?: string | null;
  items?: { item_type?: "MENU_ITEM" | "ADD_ON"; catalog_id?: string; quantity?: number; is_extra?: boolean }[];
}

function mealPlanInput(plans: PlanBody[]): MealPlanEntryInput[] {
  const seen = new Set<string>();
  return plans.map((p) => {
    const key = `${p.date!.toISOString()}|${p.meal_type}`;
    if (seen.has(key)) throw new ValidationError("A meal type can be planned only once per day.");
    seen.add(key);
    return {
      date: p.date!,
      mealType: p.meal_type!,
      menuId: p.menu_id ?? null,
      items: (p.items ?? []).map((i) => ({ itemType: i.item_type!, catalogId: i.catalog_id!, quantity: i.quantity ?? 1, isExtra: i.is_extra ?? false })),
    };
  });
}

/** One day and one meal is a Single order; several days or meals is a Multi order (how the app decides it). */
function kindOf(start: Date, end: Date, plans: PlanBody[]) {
  const days = new Set(plans.map((p) => p.date!.toISOString()));
  const meals = new Set(plans.map((p) => p.meal_type));
  return start.getTime() !== end.getTime() || days.size > 1 || meals.size > 1 ? "MULTI" : "SINGLE";
}

function datesOf(start: Date, end: Date, unchangedFrom?: Date) {
  if (end.getTime() < start.getTime()) throw new ValidationError("The event end date cannot be before the start date.");
  if (isBackdated(start, unchangedFrom)) throw new ValidationError("Event Date can't be in the past.");
}

/** Creates the order and, like the app, its event and menu selection. Returns the new order's id. */
export async function apiCreateOrder(organizationId: string, body: unknown): Promise<string> {
  const b = parse(orderCreateSchema, body);
  const start = b.event_start_date!;
  const end = b.event_end_date ?? start;
  datesOf(start, end);
  const plans = (b.meal_plans ?? []) as PlanBody[];
  const adults = b.adult_count ?? null;
  const total = [b.adult_count, b.child_below_5_count, b.child_5_to_10_count].some((n) => n !== undefined) ? (adults ?? 0) + (b.child_below_5_count ?? 0) + (b.child_5_to_10_count ?? 0) : null;
  const input: OrderInput = {
    customerId: b.customer_id!,
    eventTypeId: b.event_type_id ?? null,
    eventStartDate: start,
    eventEndDate: end,
    venue: b.venue,
    eventAddress: b.event_address,
    menuPreference: b.menu_preference ?? null,
    adultCount: adults,
    childBelow5Count: b.child_below_5_count ?? null,
    child5To10Count: b.child_5_to_10_count ?? null,
    totalParticipants: total,
    orderKind: kindOf(start, end, plans),
    notes: b.notes,
    mealPlanEntries: plans.length > 0 ? mealPlanInput(plans) : undefined,
  };
  const order = await createOrder(organizationId, input);
  await syncOrderEvent(organizationId, order.id);
  await ensureOrderMenuSelection(organizationId, order.id);
  return order.id;
}

/** Changes an order's details. The meal plan can be replaced only while the order is still Pending Review (before its menu is sent). */
export async function apiUpdateOrder(organizationId: string, id: string, body: unknown): Promise<void> {
  const b = parse(orderPatchSchema, body);
  const before = await prisma.order.findFirst({ where: { id, organizationId } });
  if (!before) throw notFound("Order");
  if (before.status === "CANCELLED" || before.status === "COMPLETED") throw new ApiError(409, "ORDER_CLOSED", "A completed or cancelled order can no longer be changed.");
  if (b.meal_plans !== undefined && before.status !== "PENDING_REVIEW") throw new ApiError(409, "MEAL_PLAN_LOCKED", "The meal plan can only be changed while the order is Pending Review, before its menu is sent.");

  const start = b.event_start_date ?? before.eventStartDate;
  const end = b.event_end_date ?? (b.event_start_date && before.eventEndDate.getTime() < b.event_start_date.getTime() ? b.event_start_date : before.eventEndDate);
  datesOf(start, end, before.eventStartDate);
  const plans = b.meal_plans as PlanBody[] | undefined;
  const countsGiven = [b.adult_count, b.child_below_5_count, b.child_5_to_10_count].some((n) => n !== undefined);
  const adults = b.adult_count ?? before.adultCount;
  const below5 = b.child_below_5_count ?? before.childBelow5Count;
  const upTo10 = b.child_5_to_10_count ?? before.child5To10Count;
  const input: OrderInput = {
    customerId: b.customer_id ?? before.customerId,
    eventTypeId: b.event_type_id === undefined ? before.eventTypeId : b.event_type_id,
    eventStartDate: start,
    eventEndDate: end,
    venue: b.venue,
    eventAddress: b.event_address,
    menuPreference: b.menu_preference,
    adultCount: b.adult_count,
    childBelow5Count: b.child_below_5_count,
    child5To10Count: b.child_5_to_10_count,
    totalParticipants: countsGiven ? (adults ?? 0) + (below5 ?? 0) + (upTo10 ?? 0) : undefined,
    orderKind: plans ? kindOf(start, end, plans) : undefined,
    notes: b.notes,
    mealPlanEntries: plans ? mealPlanInput(plans) : undefined,
  };
  await updateOrder(organizationId, id, input);
  await syncOrderEvent(organizationId, id);
  await ensureOrderMenuSelection(organizationId, id);
}
