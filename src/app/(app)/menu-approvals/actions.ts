"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import {
  setMenuSelectionItems,
  kitchenApproves,
  kitchenRequestsChanges,
  resumeKitchenReview,
  lockMenuSelection,
  InvalidMenuSelectionTransitionError,
} from "@/modules/menu-approvals/menu-approval";
import type { OrderItemCatalogInput } from "@/modules/orders/order";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  if (error instanceof InvalidMenuSelectionTransitionError) {
    return { ok: false, error: "This menu selection can no longer make that move." };
  }
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function revalidate(id: string) {
  revalidatePath("/menu-approvals");
  revalidatePath(`/menu-approvals/${id}`);
}

export async function updateMenuApprovalItemsAction(id: string, items: OrderItemCatalogInput[]): Promise<ActionResult> {
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

export async function resumeKitchenReviewAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  try {
    await resumeKitchenReview(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidate(id);
  return { ok: true };
}

export async function lockMenuSelectionAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  try {
    await lockMenuSelection(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidate(id);
  return { ok: true };
}
