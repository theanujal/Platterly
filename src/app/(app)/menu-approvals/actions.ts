"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import {
  setMenuSelectionItems,
  setCustomMenuPricePerPlate,
  kitchenApproves,
  kitchenRequestsChanges,
  InvalidMenuSelectionTransitionError,
  type MenuSelectionItemInput,
} from "@/modules/menu-approvals/menu-approval";
import { sendMenuForApproval, recallMenuFromCustomer } from "@/modules/menu-approvals/approval-link";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  if (error instanceof InvalidMenuSelectionTransitionError) {
    return { ok: false, error: error.message || "This menu selection can no longer make that move." };
  }
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function revalidate(id: string) {
  revalidatePath("/menu-approvals");
  revalidatePath(`/menu-approvals/${id}`);
}

export async function updateMenuApprovalItemsAction(id: string, items: MenuSelectionItemInput[]): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  try {
    await setMenuSelectionItems(organizationId, id, items, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidate(id);
  return { ok: true };
}

export async function kitchenApprovesAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  try {
    await kitchenApproves(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidate(id);
  return { ok: true };
}

export async function kitchenRequestsChangesAction(id: string, note: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  try {
    await kitchenRequestsChanges(organizationId, id, session.user.id, note || undefined);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidate(id);
  return { ok: true };
}

export type SendMenuResult = { ok: true; url: string; versionNumber: number } | { ok: false; error: string };

/** "Send Menu for Approval" — from the Menu Approvals detail page (by selection) or the Order page (by order, creating the event/selection if needed). */
export async function sendMenuForApprovalAction(target: { orderId: string } | { menuSelectionId: string }): Promise<SendMenuResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  try {
    const sent = await sendMenuForApproval(organizationId, target, session.user.id);
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
  try {
    await setCustomMenuPricePerPlate(organizationId, id, pricePerPlate, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidate(id);
  return { ok: true };
}
