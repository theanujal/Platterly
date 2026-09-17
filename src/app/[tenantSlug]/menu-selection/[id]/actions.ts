"use server";

import { getPublishedTenantBySlug } from "@/modules/tenants/tenant";
import { setMenuSelectionItems, customerApproves, customerRequestsChanges, InvalidMenuSelectionTransitionError } from "@/modules/menu-approvals/menu-approval";
import type { OrderItemCatalogInput } from "@/modules/orders/order";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  if (error instanceof InvalidMenuSelectionTransitionError) {
    return { ok: false, error: "This menu selection can no longer be changed." };
  }
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

async function resolveOrganizationId(tenantSlug: string) {
  const organization = await getPublishedTenantBySlug(tenantSlug);
  if (!organization) throw new Error("This page is no longer available.");
  return organization.id;
}

export async function saveMenuSelectionItemsAction(tenantSlug: string, menuSelectionId: string, items: OrderItemCatalogInput[]): Promise<ActionResult> {
  try {
    const organizationId = await resolveOrganizationId(tenantSlug);
    await setMenuSelectionItems(organizationId, menuSelectionId, items);
  } catch (error) {
    return toErrorResult(error);
  }
  return { ok: true };
}

export async function approveMenuSelectionAction(tenantSlug: string, menuSelectionId: string): Promise<ActionResult> {
  try {
    const organizationId = await resolveOrganizationId(tenantSlug);
    await customerApproves(organizationId, menuSelectionId);
  } catch (error) {
    return toErrorResult(error);
  }
  return { ok: true };
}

export async function requestMenuSelectionChangesAction(tenantSlug: string, menuSelectionId: string, note: string): Promise<ActionResult> {
  try {
    const organizationId = await resolveOrganizationId(tenantSlug);
    await customerRequestsChanges(organizationId, menuSelectionId, note || undefined);
  } catch (error) {
    return toErrorResult(error);
  }
  return { ok: true };
}
