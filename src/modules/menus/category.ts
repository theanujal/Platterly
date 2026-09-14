import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";

export class CategoryNameTakenError extends Error {}

export interface CategoryInput {
  name: string;
  sortOrder?: number;
}

export async function createCategory(organizationId: string, input: CategoryInput, actorUserId: string) {
  const existing = await prisma.menuCategory.findUnique({
    where: { organizationId_name: { organizationId, name: input.name } },
  });
  if (existing) {
    throw new CategoryNameTakenError(`Category "${input.name}" already exists.`);
  }

  const category = await prisma.menuCategory.create({
    data: { organizationId, name: input.name, sortOrder: input.sortOrder ?? 0 },
  });

  await audit({
    organizationId,
    actorUserId,
    action: "menu_category.create",
    recordType: "MenuCategory",
    recordId: category.id,
    after: JSON.parse(JSON.stringify(category)),
  });

  return category;
}

export async function updateCategory(
  organizationId: string,
  id: string,
  input: CategoryInput,
  actorUserId: string,
) {
  const before = await prisma.menuCategory.findFirstOrThrow({ where: { id, organizationId } });

  const after = await prisma.menuCategory.update({
    where: { id },
    data: { name: input.name, sortOrder: input.sortOrder ?? before.sortOrder },
  });

  await audit({
    organizationId,
    actorUserId,
    action: "menu_category.update",
    recordType: "MenuCategory",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });

  return after;
}

/** Items in this category are not deleted — their categoryId is set null (schema's onDelete: SetNull). */
export async function deleteCategory(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.menuCategory.findFirstOrThrow({ where: { id, organizationId } });

  await prisma.menuCategory.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "menu_category.delete",
    recordType: "MenuCategory",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

export async function listCategories(organizationId: string) {
  return prisma.menuCategory.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}
