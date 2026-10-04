"use server";

import { assertMenuSelectionAtMyLocation, assertOrderAtMyLocation } from "@/modules/locations/active-location";
import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import {
  setMenuSelectionItems,
  setCustomMenuPricePerPlate,
  approveAndSendToKitchen,
  updateMenuApprovalMealPlan,
  addMenuApprovalNote,
  InvalidMenuSelectionTransitionError,
  type MenuSelectionItemInput,
} from "@/modules/menu-approvals/menu-approval";
import { getMenuPickerData, type MenuPickerData } from "@/modules/menus/menu";
import { prisma } from "@/lib/db";
import type { MealType, MenuSelectionStatus } from "@/generated/prisma/enums";
import { sendMenuForApproval, recallMenuFromCustomer } from "@/modules/menu-approvals/approval-link";
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

/** "Send Menu for Approval" — from the Menu Approvals detail page (by selection) or the Order page (by order, creating the event/selection if needed). */
export async function sendMenuForApprovalAction(target: { orderId: string } | { menuSelectionId: string }, note?: string): Promise<SendMenuResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  if ("orderId" in target) await assertOrderAtMyLocation(organizationId, session.user.id, target.orderId);
  else await assertMenuSelectionAtMyLocation(organizationId, session.user.id, target.menuSelectionId);
  try {
    const sent = await sendMenuForApproval(organizationId, target, session.user.id, note);
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

export async function setCustomMenuPriceAction(id: string, pricePerPlate: number): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
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

/** Saves the Menu Planning grid from the Menu Approvals page straight onto the order (live sync), re-pricing it. */
export async function updateMenuApprovalMealPlanAction(id: string, entries: MealPlanEntryPayload[]): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  await assertMenuSelectionAtMyLocation(organizationId, session.user.id, id);
  try {
    await updateMenuApprovalMealPlan(
      organizationId,
      id,
      entries.map((entry) => ({
        date: new Date(entry.date),
        mealType: entry.mealType,
        price: entry.price ?? undefined,
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

/** Feeds the food-item drawer on the Menu Approvals page — gated by menus:approve, not orders:view, so the approving team needs no order access. */
export async function getMenuForApprovalPickerAction(menuId: string): Promise<MenuPickerData | null> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  return getMenuPickerData(organizationId, menuId);
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
    await addMenuApprovalNote(organizationId, id, { authorType: "TEAM", authorName: session.user.name ?? null, body, versionNumber: selection.currentVersion });
  } catch (error) {
    return toErrorResult(error);
  }
  revalidate(id);
  return { ok: true };
}
