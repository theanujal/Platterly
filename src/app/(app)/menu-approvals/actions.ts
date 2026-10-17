"use server";

import { assertMenuSelectionAtMyLocation, assertOrderAtMyLocation } from "@/modules/locations/active-location";
import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission, requireSensitive, canSee } from "@/lib/auth/require-session";
import { savedMealPrices } from "@/modules/roles/keep-pricing";
import { pickerWithoutPrices } from "@/modules/roles/redact";
import {
  setMenuSelectionItems,
  setCustomMenuPricePerPlate,
  approveAndSendToKitchen,
  updateMenuApprovalMealPlan,
  addNoteToOpenOrder,
  InvalidMenuSelectionTransitionError,
  type MenuSelectionItemInput,
} from "@/modules/menu-approvals/menu-approval";
import { getMenuPickerData, type MenuPickerData } from "@/modules/menus/menu";
import { prisma } from "@/lib/db";
import type { MealType, MenuSelectionStatus } from "@/generated/prisma/enums";
import { sendMenuForApproval, recallMenuFromCustomer, ensureOrderMenuSelection } from "@/modules/menu-approvals/approval-link";
import { changeStatusManually, ManualStatusChangeError, type ManualStatusTarget } from "@/modules/menu-approvals/manual-status";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  if (error instanceof InvalidMenuSelectionTransitionError || error instanceof ManualStatusChangeError) {
    return { ok: false, error: error.message || "This menu selection can no longer make that move." };
  }
  return { ok: false, error: userMessage(error, "Something went wrong.") };
}

function revalidate(id: string) {
  revalidatePath("/menu-approvals");
  revalidatePath(`/menu-approvals/${id}`);
}

export async function updateMenuApprovalItemsAction(id: string, items: MenuSelectionItemInput[]): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  await assertMenuSelectionAtMyLocation(organizationId, session.user.id, id);
  try {
    await setMenuSelectionItems(organizationId, id, items, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidate(id);
  return { ok: true };
}

/** "Approve & Send to Kitchen": the team's own click once the customer has approved; it locks the menu for the kitchen. */
export async function approveAndSendToKitchenAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  await assertMenuSelectionAtMyLocation(organizationId, session.user.id, id);
  try {
    await approveAndSendToKitchen(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidate(id);
  revalidatePath("/orders");
  return { ok: true };
}

/** Sets the menu approval's status by hand (the order follows). A reason is required and kept in the status history. */
export async function changeMenuStatusAction(id: string, status: MenuSelectionStatus, reason: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  await assertMenuSelectionAtMyLocation(organizationId, session.user.id, id);
  try {
    const target: ManualStatusTarget = { kind: "MENU", status };
    await changeStatusManually(organizationId, { menuSelectionId: id, target, reason, actorUserId: session.user.id });
  } catch (error) {
    return toErrorResult(error);
  }
  revalidate(id);
  revalidatePath("/orders");
  return { ok: true };
}

export type SendMenuResult = { ok: true; url: string; versionNumber: number } | { ok: false; error: string };

/** "Send Menu for Approval" (`replaceLive`: "Resend updated menu" while the menu is already with the customer) — from the Menu Approvals detail page (by selection) or the Order page (by order, creating the event/selection if needed). */
export async function sendMenuForApprovalAction(target: { orderId: string } | { menuSelectionId: string }, note?: string, replaceLive = false): Promise<SendMenuResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  if ("orderId" in target) await assertOrderAtMyLocation(organizationId, session.user.id, target.orderId);
  else await assertMenuSelectionAtMyLocation(organizationId, session.user.id, target.menuSelectionId);
  try {
    const sent = await sendMenuForApproval(organizationId, target, session.user.id, note, { replaceLive });
    revalidate(sent.menuSelectionId);
    revalidatePath("/orders");
    if ("orderId" in target) revalidatePath(`/orders/${target.orderId}`);
    return { ok: true, url: sent.url, versionNumber: sent.versionNumber };
  } catch (error) {
    const failed = toErrorResult(error);
    return failed.ok ? { ok: false, error: "Something went wrong." } : failed;
  }
}

export async function recallMenuAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  await assertMenuSelectionAtMyLocation(organizationId, session.user.id, id);
  try {
    await recallMenuFromCustomer(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidate(id);
  revalidatePath("/orders");
  return { ok: true };
}

/**
 * Quotes a Custom Menu's price per plate. It sets the order's menu amount, so it needs the permission that governs order prices
 * (`orders: edit`) as well as `menus: approve` (Decision 8): an approval-only user gains no pricing right. Only while the menu is in
 * Needs Review or Changes Requested (the module refuses the other stages).
 */
export async function setCustomMenuPriceAction(id: string, pricePerPlate: number): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  await requirePermission({ orders: ["edit"] }, organizationId);
  // Quoting a price is setting an order price: it needs the order-prices right as well (AJ, 2026-10-17).
  await requireSensitive("orderPrices", organizationId);
  await assertMenuSelectionAtMyLocation(organizationId, session.user.id, id);
  try {
    await setCustomMenuPricePerPlate(organizationId, id, pricePerPlate, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidate(id);
  return { ok: true };
}

/** One meal of the planner, as the client holds it (dates as ISO days, items keyed by catalog id). */
export interface MealPlanEntryPayload {
  date: string;
  mealType: MealType;
  /** Only used when the order has Individual Pricing on. */
  price: number | null;
  menuId: string | null;
  items: { itemType: "MENU_ITEM" | "ADD_ON"; catalogId: string; quantity: number; isExtra?: boolean }[];
}

/** Saves the Menu Planning grid from the order's Menu Approval tab straight onto the order (live sync), re-pricing it. */
export async function updateMenuApprovalMealPlanAction(id: string, entries: MealPlanEntryPayload[]): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  await assertMenuSelectionAtMyLocation(organizationId, session.user.id, id);
  // Without the order-prices right a submitted per-plate price is ignored: each meal keeps the price it already has.
  const mayPrice = await canSee("orderPrices", organizationId);
  const located = mayPrice ? null : await prisma.menuSelection.findFirst({ where: { id, organizationId }, select: { event: { select: { orderId: true } } } });
  const keptPrices = located?.event.orderId ? await savedMealPrices(organizationId, located.event.orderId) : new Map<string, number | undefined>();
  try {
    await updateMenuApprovalMealPlan(
      organizationId,
      id,
      entries.map((entry) => ({
        date: new Date(entry.date),
        mealType: entry.mealType,
        price: mayPrice ? entry.price ?? undefined : keptPrices.get(`${entry.date.slice(0, 10)}|${entry.mealType}`),
        menuId: entry.menuId,
        items: entry.items.map((item) => ({ itemType: item.itemType, catalogId: item.catalogId, quantity: Math.max(1, Math.floor(item.quantity)), isExtra: item.isExtra === true })),
      })),
      session.user.id,
    );
  } catch (error) {
    return toErrorResult(error);
  }
  revalidate(id);
  revalidatePath("/orders");
  return { ok: true };
}

/** Feeds the food-item drawer in the Menu Approval tab — gated by menus:approve, not orders:view, so the approving team needs no order access. */
export async function getMenuForApprovalPickerAction(menuId: string): Promise<MenuPickerData | null> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  const picker = await getMenuPickerData(organizationId, menuId);
  return picker && !(await canSee("orderPrices", organizationId)) ? pickerWithoutPrices(picker) : picker;
}

/** A team note on the approval, kept in the note history next to the customer's and the kitchen's. */
export async function addMenuApprovalNoteAction(id: string, body: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  await assertMenuSelectionAtMyLocation(organizationId, session.user.id, id);
  try {
    if (!body.trim()) return { ok: false, error: "Write a note first." };
    if (body.length > 2000) return { ok: false, error: "Keep the note under 2000 characters." };
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { id, organizationId }, select: { currentVersion: true } });
    // A completed order is closed (Decision 15): no new notes, from any screen. Checked inside the write's own transaction, under the
    // menu's lock, so a delivery landing at the same moment is seen. The existing notes stay readable.
    await addNoteToOpenOrder(organizationId, id, { authorType: "TEAM", authorName: session.user.name ?? null, body, versionNumber: selection.currentVersion });
  } catch (error) {
    return toErrorResult(error);
  }
  revalidate(id);
  return { ok: true };
}

/**
 * "Start menu approval" for an order that has none yet (the order page's Menu Approval tab). It only creates the approval in Needs
 * Review, through the same race-safe `ensureOrderMenuSelection` the first send uses; nothing is sent to the customer. Asking twice
 * returns the same approval. Needs an Event Type, and an order that is Completed or Cancelled is closed.
 */
export async function startMenuApprovalAction(orderId: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  await assertOrderAtMyLocation(organizationId, session.user.id, orderId);
  try {
    const order = await prisma.order.findFirst({ where: { id: orderId, organizationId }, select: { status: true, eventTypeId: true } });
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status === "COMPLETED" || order.status === "CANCELLED") return { ok: false, error: "This order is closed, so a menu approval can't be started." };
    if (!order.eventTypeId) return { ok: false, error: "Set an Event Type on the order first. Someone who can edit the order has to do that." };
    const selection = await ensureOrderMenuSelection(organizationId, orderId, session.user.id);
    if (!selection) return { ok: false, error: "Set an Event Type on the order first. Someone who can edit the order has to do that." };
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-approvals");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
