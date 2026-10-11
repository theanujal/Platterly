import "server-only";
import type { LibraryEntryDoc, LibraryEntryUpdate } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { CATEGORY_OPTIONS, normalizeCategory, normalizeUnit } from "@/modules/inventory/options";
import { normalizeName } from "./match";
import { LibraryError } from "./apply";
import { findLibraryCategory } from "./categories";

/** The library's own entries for Ops to edit (docs/ops-contract.md section 31). Library data only; kitchens' copies are never read or changed here. */
export async function listEntries(kind: "FOOD_ITEM" | "INGREDIENT" | "CATEGORY"): Promise<LibraryEntryDoc[]> {
  if (kind === "CATEGORY") {
    const rows = await prisma.systemFoodCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return rows.map((r) => ({ id: r.id, kind, name: r.name, description: null, categoryName: r.name, foodType: null, unit: null, aliases: r.aliases, isActive: true }));
  }
  if (kind === "FOOD_ITEM") {
    const rows = await prisma.systemFoodItem.findMany({ orderBy: [{ categoryName: "asc" }, { name: "asc" }] });
    return rows.map((r) => ({ id: r.id, kind, name: r.name, description: r.description, categoryName: r.categoryName, foodType: r.foodType, unit: null, aliases: r.aliases, isActive: r.isActive }));
  }
  const rows = await prisma.systemIngredient.findMany({ orderBy: [{ categoryName: "asc" }, { name: "asc" }] });
  return rows.map((r) => ({ id: r.id, kind, name: r.name, description: r.description, categoryName: r.categoryName, foodType: null, unit: r.unit, aliases: r.aliases, isActive: r.isActive }));
}

/** Every name and alias in the kind except one entry's own, normalized: what a new name or alias must not collide with. */
async function otherKeys(kind: "FOOD_ITEM" | "INGREDIENT" | "CATEGORY", exceptId: string): Promise<Set<string>> {
  const rows = kind === "CATEGORY" ? await prisma.systemFoodCategory.findMany({ where: { id: { not: exceptId } }, select: { name: true, aliases: true } }) : kind === "FOOD_ITEM" ? await prisma.systemFoodItem.findMany({ where: { id: { not: exceptId } }, select: { name: true, aliases: true } }) : await prisma.systemIngredient.findMany({ where: { id: { not: exceptId } }, select: { name: true, aliases: true } });
  return new Set(rows.flatMap((r) => [r.name, ...r.aliases]).map(normalizeName));
}

/**
 * Changes one library entry and marks it edited so the catalog seed leaves it alone. A rename keeps the old name as an alias, so
 * matching still recognises it and the seed cannot bring it back as a second entry. Safe to repeat.
 */
export async function updateEntry(update: LibraryEntryUpdate): Promise<"applied"> {
  if (update.kind === "CATEGORY") return updateCategory(update);
  const food = update.kind === "FOOD_ITEM";
  const current = food ? await prisma.systemFoodItem.findUnique({ where: { id: update.id } }) : await prisma.systemIngredient.findUnique({ where: { id: update.id } });
  if (!current) throw new LibraryError("That library entry was not found.", 404);

  const name = update.name?.trim();
  const renamed = name !== undefined && name !== current.name;
  let aliases = update.aliases ?? current.aliases;
  if (renamed) {
    if ((await otherKeys(update.kind, update.id)).has(normalizeName(name))) throw new LibraryError(`"${name}" is already in the library. Merge or rename the other entry first.`, 409);
    if (!aliases.some((a) => normalizeName(a) === normalizeName(current.name))) aliases = [...aliases, current.name];
  }
  aliases = aliases.filter((a) => !name || normalizeName(a) !== normalizeName(name));
  if (update.aliases) {
    const taken = await otherKeys(update.kind, update.id);
    const clash = aliases.find((a) => taken.has(normalizeName(a)));
    if (clash) throw new LibraryError(`"${clash}" already belongs to another library entry.`, 409);
  }

  if (food) {
    let dishCategory: string | undefined;
    if (update.categoryName) {
      dishCategory = (await findLibraryCategory(update.categoryName))?.name;
      if (!dishCategory) throw new LibraryError(`"${update.categoryName}" is not one of the library's categories. Choose one from the list.`, 400);
    }
    await prisma.systemFoodItem.update({
      where: { id: update.id },
      data: { ...(renamed ? { name } : {}), aliases, ...(update.description !== undefined ? { description: update.description } : {}), ...(dishCategory ? { categoryName: dishCategory } : {}), ...(update.foodType ? { foodType: update.foodType } : {}), ...(update.isActive !== undefined ? { isActive: update.isActive } : {}), editedInOps: true },
    });
    return "applied";
  }
  let categoryName: string | undefined;
  if (update.categoryName) {
    categoryName = normalizeCategory(update.categoryName) ?? undefined;
    if (!categoryName) throw new LibraryError(`Category must be one of: ${CATEGORY_OPTIONS.join(", ")}.`, 400);
  }
  let unit: string | undefined;
  if (update.unit) {
    unit = normalizeUnit(update.unit) ?? undefined;
    if (!unit) throw new LibraryError("Choose a valid unit.", 400);
  }
  await prisma.systemIngredient.update({
    where: { id: update.id },
    data: { ...(renamed ? { name } : {}), aliases, ...(update.description !== undefined ? { description: update.description } : {}), ...(categoryName ? { categoryName } : {}), ...(unit ? { unit } : {}), ...(update.isActive !== undefined ? { isActive: update.isActive } : {}), editedInOps: true },
  });
  return "applied";
}

/**
 * Renames a library category (every library dish in it follows, and the old name stays as another name) or changes its other names.
 * A category is not hidden or given a type, unit or description. Kitchens' own categories never change.
 */
async function updateCategory(update: LibraryEntryUpdate): Promise<"applied"> {
  if (update.isActive === false) throw new LibraryError("A category cannot be hidden. Rename it, or move its dishes elsewhere.", 400);
  const current = await prisma.systemFoodCategory.findUnique({ where: { id: update.id } });
  if (!current) throw new LibraryError("That library category was not found.", 404);
  const name = update.name?.trim();
  const renamed = name !== undefined && name !== current.name;
  const taken = await otherKeys("CATEGORY", update.id);
  let aliases = update.aliases ?? current.aliases;
  if (renamed) {
    if (taken.has(normalizeName(name))) throw new LibraryError(`"${name}" is already a library category.`, 409);
    if (!aliases.some((a) => normalizeName(a) === normalizeName(current.name))) aliases = [...aliases, current.name];
  }
  aliases = aliases.filter((a) => !name || normalizeName(a) !== normalizeName(name));
  if (update.aliases) {
    const clash = aliases.find((a) => taken.has(normalizeName(a)));
    if (clash) throw new LibraryError(`"${clash}" already belongs to another library category.`, 409);
  }
  await prisma.$transaction([
    prisma.systemFoodCategory.update({ where: { id: update.id }, data: { ...(renamed ? { name } : {}), aliases } }),
    ...(renamed ? [prisma.systemFoodItem.updateMany({ where: { categoryName: current.name }, data: { categoryName: name, editedInOps: true } })] : []),
  ]);
  return "applied";
}
