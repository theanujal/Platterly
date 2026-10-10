import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStorageDriver } from "@/lib/storage/storage";
import { prisma } from "@/lib/db";
import { createCategory } from "@/modules/menus/category";
import { createMenuItem, MenuItemNameTakenError } from "@/modules/menus/item";
import type { FoodType } from "@/generated/prisma/enums";
import { RULES, validateInput } from "@/lib/validation";

export interface BulkEntry {
  name: string;
  foodType: FoodType;
  price: number;
  description?: string;
  categoryNames: string[];
  /** A catalog picture: a /catalog/photos file is copied into the business's own storage; an illustration is shared. */
  imageUrl?: string;
  sourceCatalogId?: string;
}

export interface BulkResult {
  created: number;
  skipped: { name: string; reason: string }[];
  failed: { name: string; reason: string }[];
}

const PHOTO_PREFIX = "/catalog/photos/";

/** Photos are copied so the business owns its picture and a later catalog change never touches it. */
async function ownImage(organizationId: string, imageUrl: string | undefined): Promise<string | undefined> {
  if (!imageUrl?.startsWith(PHOTO_PREFIX)) return imageUrl;
  const file = path.basename(imageUrl);
  const data = await readFile(path.join(process.cwd(), "public", "catalog", "photos", file));
  const key = `organizations/${organizationId}/catalog/items/${crypto.randomUUID()}.webp`;
  return (await getStorageDriver().upload(key, data, "image/webp")).url;
}

/**
 * Shared by the Excel/CSV import and the Platterly catalog. Food item names are unique per business (AJ,
 * 2026-10-10), so a name that already exists - or repeats earlier in the same batch - is skipped and reported, never
 * overwritten. Categories are found by name (ignoring case) or created.
 */
export async function bulkAddFoodItems(organizationId: string, entries: BulkEntry[], actorUserId: string): Promise<BulkResult> {
  const result: BulkResult = { created: 0, skipped: [], failed: [] };
  const categories = new Map((await prisma.menuCategory.findMany({ where: { organizationId } })).map((c) => [c.name.toLowerCase(), c.id]));
  const taken = new Set((await prisma.menuItem.findMany({ where: { organizationId }, select: { name: true } })).map((i) => i.name.toLowerCase()));

  for (const entry of entries) {
    const name = entry.name.trim();
    if (taken.has(name.toLowerCase())) {
      result.skipped.push({ name, reason: "Already in your Food Items." });
      continue;
    }
    try {
      validateInput({ name, price: entry.price, description: entry.description }, RULES.menuItem);
      const categoryIds: string[] = [];
      for (const categoryName of entry.categoryNames) {
        let id = categories.get(categoryName.toLowerCase());
        if (!id) {
          id = (await createCategory(organizationId, { name: categoryName }, actorUserId)).id;
          categories.set(categoryName.toLowerCase(), id);
        }
        if (!categoryIds.includes(id)) categoryIds.push(id);
      }
      const item = await createMenuItem(
        organizationId,
        { name, foodType: entry.foodType, price: entry.price, description: entry.description, image: await ownImage(organizationId, entry.imageUrl), categoryIds },
        actorUserId,
      );
      if (entry.sourceCatalogId) await prisma.menuItem.update({ where: { id: item.id }, data: { sourceCatalogId: entry.sourceCatalogId } });
      taken.add(name.toLowerCase());
      result.created++;
    } catch (error) {
      if (error instanceof MenuItemNameTakenError) result.skipped.push({ name, reason: "Already in your Food Items." });
      else result.failed.push({ name, reason: error instanceof Error ? error.message : "Could not be added." });
    }
  }
  return result;
}
