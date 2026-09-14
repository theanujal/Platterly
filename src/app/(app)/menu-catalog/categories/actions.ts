"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  listCategoryMenuAssignments,
  type CategoryInput,
} from "@/modules/menus/category";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function createCategoryAction(input: CategoryInput): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["create"] }, organizationId);
  try {
    await createCategory(organizationId, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/categories");
  return { ok: true };
}

export async function updateCategoryAction(id: string, input: CategoryInput): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    await updateCategory(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/categories");
  return { ok: true };
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["delete"] }, organizationId);
  try {
    await deleteCategory(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/categories");
  return { ok: true };
}

export interface CategoryMenuAssignmentSummary {
  id: string;
  menuId: string;
  menuName: string;
  maxSelection: number | null;
  sortOrder: number;
}

// Returns plain, pre-serialized fields only — the underlying MenuCategoryAssignment/Menu
// rows carry a Decimal (Menu.pricePerPlate) which can't cross the Server->Client
// boundary this action is called from (see the earlier catalog-image RSC fix).
export async function getCategoryMenuAssignmentsAction(categoryId: string): Promise<CategoryMenuAssignmentSummary[]> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["view"] }, organizationId);
  const assignments = await listCategoryMenuAssignments(organizationId, categoryId);
  return assignments.map((a) => ({
    id: a.id,
    menuId: a.menuId,
    menuName: a.menu.name,
    maxSelection: a.maxSelection,
    sortOrder: a.sortOrder,
  }));
}
