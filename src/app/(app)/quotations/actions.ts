"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import {
  createQuotation,
  updateQuotation,
  deleteQuotation,
  sendQuotation,
  markQuotationExpired,
  convertQuotationToOrder,
  type QuotationInput,
} from "@/modules/quotations/quotation";
import { syncOrderEvent, type OrderItemCatalogInput, type MealPlanEntryInput } from "@/modules/orders/order";
import { ensureOrderMenuSelection } from "@/modules/menu-approvals/approval-link";
import { getMenuPickerData, type MenuPickerData } from "@/modules/menus/menu";
import type { OrderKind, MealType, FoodType, PricingMethod, ChildPricingType } from "@/generated/prisma/enums";

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

/** Mirrors orders/actions.ts's own `buildMealPlanEntries` exactly — same field names, same per-slot JSON-encoded items. */
function buildMealPlanEntries(formData: FormData): MealPlanEntryInput[] {
  const dates = formData.getAll("mealDate").filter((v): v is string => typeof v === "string");
  const mealTypes = formData.getAll("mealType").filter((v): v is string => typeof v === "string");
  const prices = formData.getAll("mealPrice").filter((v): v is string => typeof v === "string");
  const menuIds = formData.getAll("mealMenuId").filter((v): v is string => typeof v === "string");
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

function buildInput(formData: FormData): QuotationInput {
  const customerId = stringField(formData, "customerId");
  if (!customerId) throw new Error("A Customer is required.");

  return {
    customerId,
    eventTypeId: stringField(formData, "eventTypeId") ?? null,
    menuPreference: (stringField(formData, "menuPreference") as FoodType | undefined) ?? null,
    orderKind: (stringField(formData, "orderKind") as OrderKind | undefined) ?? "SINGLE",
    eventStartDate: dateField(formData, "eventStartDate") ?? null,
    eventEndDate: dateField(formData, "eventEndDate") ?? null,
    venue: stringField(formData, "venue"),
    eventAddress: stringField(formData, "eventAddress"),
    adultCount: numberField(formData, "adultCount") ?? null,
    childBelow5Count: numberField(formData, "childBelow5Count") ?? null,
    child5To10Count: numberField(formData, "child5To10Count") ?? null,
    totalParticipants: numberField(formData, "totalParticipants") ?? null,
    pricingMethod: (stringField(formData, "pricingMethod") as PricingMethod | undefined) ?? "STANDARD",
    individualChildBelow5Rate: numberField(formData, "individualChildBelow5Rate") ?? null,
    individualChildBelow5PricingType: (stringField(formData, "individualChildBelow5PricingType") as ChildPricingType | undefined) ?? null,
    individualChild5To10Rate: numberField(formData, "individualChild5To10Rate") ?? null,
    individualChild5To10PricingType: (stringField(formData, "individualChild5To10PricingType") as ChildPricingType | undefined) ?? null,
    individualPricingEnabled: formData.get("individualPricingEnabled") === "true",
    validUntil: dateField(formData, "validUntil") ?? null,
    terms: stringField(formData, "terms"),
    notes: stringField(formData, "notes"),
    discount: numberField(formData, "discount") ?? 0,
    taxes: numberField(formData, "taxes") ?? 0,
    additionalCharges: numberField(formData, "additionalCharges") ?? 0,
    deliveryCharges: numberField(formData, "deliveryCharges") ?? 0,
    mealPlanEntries: buildMealPlanEntries(formData),
  };
}

/** Item-picker parity with Order (2026-09-28) — same shared `getMenuPickerData` as orders/actions.ts's `getMenuForOrderPickerAction`, gated on the `quotations` resource instead of `orders`. */
export async function getMenuForQuotationPickerAction(menuId: string): Promise<MenuPickerData | null> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["view"] }, organizationId);
  return getMenuPickerData(organizationId, menuId);
}

// Same rule as Create Order's own (orders/actions.ts) — applied consistently
// "wherever event dates are entered" (AJ, 2026-09-19). Reuses the `orders`
// resource's bypass_date_restriction permission rather than adding a
// duplicate `quotations` one, since it's the same underlying business rule.
// Skipped entirely when no event date is set yet — unlike Order, a
// Quotation's event date is optional (early-stage sales artifact).
const MIN_DAYS_BEFORE_EVENT = 2;

function daysUntil(date: Date): number {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfEvent = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((startOfEvent.getTime() - startOfToday.getTime()) / 86_400_000);
}

async function assertEventDateAllowed(organizationId: string, eventStartDate: Date | null | undefined) {
  if (!eventStartDate) return;
  if (daysUntil(eventStartDate) >= MIN_DAYS_BEFORE_EVENT) return;
  const canBypass = await hasPermission({ orders: ["bypass_date_restriction"] }, organizationId);
  if (!canBypass) {
    throw new Error(`Quotations can't normally be created or edited for an event less than ${MIN_DAYS_BEFORE_EVENT} days away. Ask an Owner.`);
  }
}

export async function createQuotationAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["create"] }, organizationId);
  try {
    const input = buildInput(formData);
    await assertEventDateAllowed(organizationId, input.eventStartDate);
    await createQuotation(organizationId, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/quotations");
  return { ok: true };
}

export async function updateQuotationAction(id: string, formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["edit"] }, organizationId);
  try {
    const input = buildInput(formData);
    await assertEventDateAllowed(organizationId, input.eventStartDate);
    await updateQuotation(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { ok: true };
}

export async function deleteQuotationAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["delete"] }, organizationId);
  try {
    await deleteQuotation(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/quotations");
  return { ok: true };
}

export async function sendQuotationAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["edit"] }, organizationId);
  try {
    await sendQuotation(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/quotations/${id}`);
  return { ok: true };
}

export async function markQuotationExpiredAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["edit"] }, organizationId);
  try {
    await markQuotationExpired(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/quotations/${id}`);
  return { ok: true };
}

export async function convertQuotationToOrderAction(id: string): Promise<ActionResult & { orderId?: string }> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["edit"], orders: ["create"] }, organizationId);
  try {
    const order = await convertQuotationToOrder(organizationId, id, session.user.id);
    await syncOrderEvent(organizationId, order.id, session.user.id);
    await ensureOrderMenuSelection(organizationId, order.id, session.user.id);
    revalidatePath(`/quotations/${id}`);
    revalidatePath("/orders");
    return { ok: true, orderId: order.id };
  } catch (error) {
    return toErrorResult(error);
  }
}
